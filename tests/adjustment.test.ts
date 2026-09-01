import { describe, expect, it } from "vitest";
import {
  adjustmentFactorE,
  allocateQuarters,
  computeAdjustment,
  type AdjustmentContract,
  type IndexRecord,
} from "@/lib/calc/adjustment";
import {
  computeHaulage,
  computeResourceConsumption,
  splitIntoTiers,
  type AnalysisRef,
  type HaulTier,
  type ResourceRef,
} from "@/lib/calc/haulage";
import type { FinancialRow } from "@/lib/calc/types";

const contract: AdjustmentContract = {
  startDate: "1403/01/01",
  allowedEndDate: "1403/12/29",
  factorD: 0.95,
  baseIndexYear: 1402,
  baseIndexQuarter: 4,
};

const indices: IndexRecord[] = [
  { chapterNo: null, year: 1402, quarter: 4, indexValue: 4000 },
  { chapterNo: null, year: 1403, quarter: 1, indexValue: 4400 },
  { chapterNo: null, year: 1403, quarter: 2, indexValue: 4800 },
  { chapterNo: null, year: 1403, quarter: 3, indexValue: 5200 },
  { chapterNo: null, year: 1403, quarter: 4, indexValue: 5600 },
  { chapterNo: 10, year: 1402, quarter: 4, indexValue: 5000 },
  { chapterNo: 10, year: 1403, quarter: 1, indexValue: 6000 },
  { chapterNo: 10, year: 1403, quarter: 2, indexValue: 6500 },
];

describe("ضریب تعدیل", () => {
  it("E = d × (It/I0 − 1)", () => {
    expect(adjustmentFactorE(4400, 4000, 0.95)).toBeCloseTo(0.095, 10);
    expect(adjustmentFactorE(5000, 4000, 1)).toBeCloseTo(0.25, 10);
  });

  it("شاخص مبنای صفر خطا می‌دهد", () => {
    expect(() => adjustmentFactorE(100, 0, 0.95)).toThrowError(/شاخص مبنا/);
  });
});

describe("انترپوله زمانی کارکرد", () => {
  it("تسهیم روزها بین سه‌ماهه‌ها و جمع وزن‌ها برابر یک", () => {
    const { allocations, totalDays } = allocateQuarters(
      contract,
      "1403/01/01",
      "1403/06/31",
    );
    expect(totalDays).toBe(186);
    expect(allocations).toHaveLength(2);
    expect(allocations[0].days).toBe(93);
    expect(allocations[1].days).toBe(93);
    expect(
      allocations.reduce((a, x) => a + x.weight, 0),
    ).toBeCloseTo(1, 9);
  });

  it("بازه قبل از شروع پیمان به تاریخ شروع محدود می‌شود", () => {
    const { allocations } = allocateQuarters(contract, "1402/10/01", "1403/01/31");
    expect(allocations[0].spanStart).toBe("1403/01/01");
    expect(allocations[0].days).toBe(31);
  });

  it("کارکرد پس از خاتمه مجاز با شاخص دوره خاتمه مجاز فریز می‌شود", () => {
    const { allocations } = allocateQuarters(contract, "1403/10/01", "1404/02/15");
    const frozen = allocations.filter((a) => a.frozenAfterAllowedEnd);
    expect(frozen.length).toBeGreaterThan(0);
    expect(frozen[0].effectiveYear).toBe(1403);
    expect(frozen[0].effectiveQuarter).toBe(4);
  });
});

describe("محاسبه مبلغ تعدیل", () => {
  it("مبلغ تعدیل فصل = کارکرد دوره × E وزنی", () => {
    const result = computeAdjustment(
      contract,
      "1403/01/01",
      "1403/06/31",
      [
        {
          chapterNo: 10,
          title: "بتن درجا",
          currentCumulative: 1_000_000_000,
          previousCumulative: 0,
        },
      ],
      indices,
    );
    const ch = result.chapters[0];
    expect(ch.periodWork).toBe(1_000_000_000);
    // Q1: 93/186 = 0.5 ، E1 = 0.95*(6000/5000-1) = 0.19
    // Q2: 0.5 ، E2 = 0.95*(6500/5000-1) = 0.285
    expect(ch.quarters[0].E).toBeCloseTo(0.19, 9);
    expect(ch.quarters[1].E).toBeCloseTo(0.285, 9);
    expect(ch.quarters[0].amount).toBe(95_000_000);
    expect(ch.quarters[1].amount).toBe(142_500_000);
    expect(ch.totalAdjustment).toBe(237_500_000);
    expect(ch.effectiveE).toBeCloseTo(0.2375, 9);
    expect(result.totalAdjustment).toBe(237_500_000);
  });

  it("کارکرد دوره از تفاضل تجمعی محاسبه می‌شود", () => {
    const result = computeAdjustment(
      contract,
      "1403/04/01",
      "1403/06/31",
      [
        {
          chapterNo: 10,
          title: "بتن درجا",
          currentCumulative: 1_500_000_000,
          previousCumulative: 1_000_000_000,
        },
      ],
      indices,
    );
    expect(result.chapters[0].periodWork).toBe(500_000_000);
    // فقط سه‌ماهه دوم: E = 0.285
    expect(result.chapters[0].totalAdjustment).toBe(142_500_000);
  });

  it("نبود شاخص برای فصل، خطای کنترل‌شده می‌دهد", () => {
    expect(() =>
      computeAdjustment(
        contract,
        "1403/01/01",
        "1403/03/31",
        [
          {
            chapterNo: 3,
            title: "خاکی",
            currentCumulative: 100,
            previousCumulative: 0,
          },
        ],
        [{ chapterNo: 3, year: 1403, quarter: 1, indexValue: 100 }],
      ),
    ).toThrowError(/شاخص تعدیل/);
  });
});

describe("مابه‌التفاوت حمل", () => {
  const resources = new Map<number, ResourceRef>([
    [
      1,
      {
        id: 1,
        code: "R-CEM",
        title: "سیمان",
        unit: "کیلوگرم",
        tonPerUnit: 0.001,
        freeHaulKm: 30,
      },
    ],
  ]);
  const analysis: AnalysisRef[] = [
    { itemKey: "P:1", resourceId: 1, consumptionPerUnit: 350 },
  ];
  const rows = [
    {
      itemKey: "P:1",
      code: "100301",
      chapterNo: 10,
      unit: "مترمکعب",
      description: "بتن",
      rawQuantity: 1000,
      quantity: 1000,
      breakdown: [],
      itemType: "normal",
      unitPrice: 1,
      netAmount: 1000,
      coefficient: 1,
      grossAmount: 1000,
      applyAdjustment: true,
    },
  ] as unknown as FinancialRow[];

  const tiers: HaulTier[] = [
    { fromKm: 0, toKm: 10, ratePerTonKm: 50000, title: "تا ۱۰" },
    { fromKm: 10, toKm: 30, ratePerTonKm: 40000, title: "۱۰ تا ۳۰" },
    { fromKm: 30, toKm: null, ratePerTonKm: 30000, title: "مازاد ۳۰" },
  ];

  it("وزن مصالح مصرفی از ضریب مصرف آنالیز به دست می‌آید", () => {
    const consumption = computeResourceConsumption(rows, analysis, resources);
    expect(consumption[0].quantity).toBe(350_000); // کیلوگرم
    expect(consumption[0].tonnage).toBe(350); // تن
  });

  it("پله‌بندی مسافت درست انجام می‌شود", () => {
    const parts = splitIntoTiers(45, tiers);
    expect(parts.map((p) => p.segmentKm)).toEqual([10, 20, 15]);
  });

  it("مبلغ حمل = Σ تناژ × طول پله × نرخ پله", () => {
    const consumption = computeResourceConsumption(rows, analysis, resources);
    const result = computeHaulage(
      consumption,
      [
        {
          resourceId: 1,
          origin: "کارخانه",
          destination: "کارگاه",
          pavedKm: 60,
          unpavedKm: 5,
          unpavedEquivalentFactor: 2,
        },
      ],
      resources,
      tiers,
    );
    const line = result.lines[0];
    expect(line.equivalentKm).toBe(70); // 60 + 5×2
    expect(line.chargeableKm).toBe(40); // منهای ۳۰ کیلومتر رایگان
    expect(line.tonKm).toBe(14_000); // 350 تن × 40 کیلومتر
    // پله‌ها: 10km@50000 + 20km@40000 + 10km@30000 = 350×(500000+800000+300000)
    expect(line.amount).toBe(350 * (10 * 50000 + 20 * 40000 + 10 * 30000));
    expect(result.totalAmount).toBe(line.amount);
  });
});
