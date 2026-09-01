import { describe, expect, it } from "vitest";
import {
  buildChapterTotals,
  buildCoefficients,
  buildFinancialRows,
  computeDeductions,
  computeSiteSetup,
} from "@/lib/calc/financial";
import { buildSummary, computeDetailRow, computeDetailRows } from "@/lib/calc/metre";
import { multiplyFactors, round } from "@/lib/calc/numeric";
import type {
  CatalogItem,
  CoefficientInput,
  DetailRowInput,
  LocationRef,
} from "@/lib/calc/types";

const catalog = new Map<string, CatalogItem>([
  [
    "P:1",
    {
      itemKey: "P:1",
      code: "100301",
      chapterNo: 10,
      description: "بتن C25 پی",
      shortDescription: "بتن C25 پی",
      unit: "مترمکعب",
      unitPrice: 5_850_000,
      itemType: "normal",
      applyCoefficients: true,
      applyAdjustment: true,
    },
  ],
  [
    "C:1",
    {
      itemKey: "C:1",
      code: "F-2001",
      chapterNo: 11,
      description: "ردیف فاکتوری",
      shortDescription: "ردیف فاکتوری",
      unit: "عدد",
      unitPrice: 10_000_000,
      itemType: "invoice",
      applyCoefficients: false,
      applyAdjustment: false,
    },
  ],
  [
    "C:2",
    {
      itemKey: "C:2",
      code: "A-100301",
      chapterNo: 10,
      description: "اضافه بها ۱۵٪",
      shortDescription: "اضافه بها ۱۵٪",
      unit: "مقطوع",
      unitPrice: 0,
      itemType: "adjust",
      applyCoefficients: true,
      applyAdjustment: true,
      relatedItemCode: "100301",
      percent: 0.15,
    },
  ],
]);

const locations = new Map<number, LocationRef>([
  [1, { id: 1, title: "فونداسیون", positionFactor: 1 }],
  [2, { id: 2, title: "سقف طبقه اول", positionFactor: 1.05 }],
]);

const baseRow = (over: Partial<DetailRowInput> & { id: number }): DetailRowInput => ({
  itemKey: "P:1",
  locationId: 1,
  description: "",
  countQty: 1,
  length: null,
  width: null,
  height: null,
  weight: null,
  sign: 1,
  ...over,
});

describe("ریزمتره", () => {
  it("جمع کل = تعداد × حاصل‌ضرب ابعاد", () => {
    const r = computeDetailRow(
      baseRow({ id: 1, countQty: 2, length: 3, width: 4, height: 0.5 }),
    );
    expect(r.dimensionProduct).toBe(6);
    expect(r.total).toBe(12);
  });

  it("ابعاد خالی در حاصل‌ضرب بی‌اثرند و وزن جایگزین می‌شود", () => {
    const r = computeDetailRow(baseRow({ id: 2, countQty: 1, weight: 96_500 }));
    expect(r.total).toBe(96_500);
  });

  it("سطر کسری مقدار را منفی می‌کند", () => {
    const r = computeDetailRow(
      baseRow({ id: 3, countQty: 1, length: 12, width: 6, height: 1.3, sign: -1 }),
    );
    expect(r.total).toBe(-93.6);
  });
});

describe("خلاصه متره و ضریب موقعیت", () => {
  it("ردیف‌های یکسان از موقعیت‌های مختلف تجمیع و ضریب موقعیت اعمال می‌شود", () => {
    const rows = computeDetailRows([
      baseRow({ id: 1, countQty: 1, length: 10, width: 10, height: 1 }), // 100 در موقعیت ۱
      baseRow({ id: 2, locationId: 2, countQty: 1, length: 10, width: 10, height: 1 }), // 100 × 1.05
    ]);
    const summary = buildSummary(rows, catalog, locations);
    expect(summary).toHaveLength(1);
    expect(summary[0].rawQuantity).toBe(200);
    expect(summary[0].quantity).toBe(205);
    expect(summary[0].breakdown).toHaveLength(2);
  });
});

describe("ترکیب ضرایب پیمان", () => {
  const coefficients: CoefficientInput[] = [
    {
      id: 1,
      kind: "overhead",
      title: "بالاسری",
      value: 1.41,
      scope: "all",
      chapterNo: null,
      includeInAdjustment: true,
      isActive: true,
    },
    {
      id: 2,
      kind: "proposal",
      title: "پیشنهادی",
      value: 0.9635,
      scope: "all",
      chapterNo: null,
      includeInAdjustment: true,
      isActive: true,
    },
    {
      id: 3,
      kind: "difficulty",
      title: "صعوبت فصل ۱۰",
      value: 1.03,
      scope: "chapter",
      chapterNo: 10,
      includeInAdjustment: false,
      isActive: true,
    },
    {
      id: 4,
      kind: "custom",
      title: "غیرفعال",
      value: 2,
      scope: "all",
      chapterNo: null,
      includeInAdjustment: true,
      isActive: false,
    },
  ];

  it("ضریب کل حاصل‌ضرب ضرایب فعال سطح دفترچه است", () => {
    const b = buildCoefficients(coefficients, [10, 11]);
    expect(b.globalFactor).toBe(round(1.41 * 0.9635, 14));
    expect(b.perChapter.get(10)!.factor).toBe(
      multiplyFactors([1.41, 0.9635, 1.03]),
    );
    // ضریب صعوبت در تعدیل لحاظ نمی‌شود
    expect(b.perChapter.get(10)!.adjustableFactor).toBe(
      multiplyFactors([1.41, 0.9635]),
    );
    expect(b.perChapter.get(11)!.factor).toBe(multiplyFactors([1.41, 0.9635]));
  });

  it("دقت ضرایب تا ۱۴ رقم اعشار حفظ می‌شود", () => {
    expect(multiplyFactors([1.00000000000001, 1])).toBe(1.00000000000001);
  });
});

describe("برگه مالی", () => {
  const coefficients: CoefficientInput[] = [
    {
      id: 1,
      kind: "overhead",
      title: "بالاسری",
      value: 1.3,
      scope: "all",
      chapterNo: null,
      includeInAdjustment: true,
      isActive: true,
    },
  ];

  it("مبلغ ردیف، ضرایب، ردیف فاکتوری و اضافه‌بها درست محاسبه می‌شود", () => {
    const rows = computeDetailRows([
      baseRow({ id: 1, countQty: 1, length: 10, width: 10, height: 1 }), // 100 مترمکعب
      baseRow({ id: 2, itemKey: "C:1", countQty: 3 }), // 3 عدد فاکتوری
      baseRow({ id: 3, itemKey: "C:2", countQty: 1 }), // اضافه بها
    ]);
    const summary = buildSummary(rows, catalog, locations);
    const breakdown = buildCoefficients(coefficients, [10, 11]);
    const financial = buildFinancialRows(summary, catalog, breakdown);

    const concrete = financial.find((r) => r.code === "100301")!;
    expect(concrete.netAmount).toBe(585_000_000);
    expect(concrete.grossAmount).toBe(760_500_000);

    // ردیف فاکتوری مشمول ضرایب نیست
    const invoice = financial.find((r) => r.code === "F-2001")!;
    expect(invoice.coefficient).toBe(1);
    expect(invoice.grossAmount).toBe(30_000_000);

    // اضافه بها = ۱۵٪ مبلغ خالص ردیف مرتبط
    const extra = financial.find((r) => r.code === "A-100301")!;
    expect(extra.netAmount).toBe(87_750_000);
    expect(extra.grossAmount).toBe(114_075_000);

    const totals = buildChapterTotals(
      financial,
      new Map([
        [10, "بتن درجا"],
        [11, "بلوک"],
      ]),
      breakdown,
    );
    const ch10 = totals.find((t) => t.chapterNo === 10)!;
    expect(ch10.netAmount).toBe(585_000_000 + 87_750_000);
    expect(ch10.grossAmount).toBe(760_500_000 + 114_075_000);
    // ردیف فاکتوری مشمول تعدیل نیست
    const ch11 = totals.find((t) => t.chapterNo === 11)!;
    expect(ch11.adjustableGrossAmount).toBe(0);
  });

  it("ردیف ناموجود در کاتالوگ خطای کنترل‌شده می‌دهد", () => {
    const rows = computeDetailRows([baseRow({ id: 9, itemKey: "P:404" })]);
    expect(() => buildSummary(rows, catalog, locations)).toThrowError(
      /یافت نشد/,
    );
  });
});

describe("تجهیز کارگاه و کسورات", () => {
  it("روش ۳۵-۳۵-۳۰", () => {
    const r = computeSiteSetup({
      method: "p35_35_30",
      approvedAmount: 10_000_000_000,
      percent: 0,
      setupProgress: 1,
      dismantleProgress: 0,
      cumulativeWork: 50_000_000_000,
      contractAmount: 100_000_000_000,
    });
    // 35% کامل + 35% × 50% پیشرفت = 3.5 + 1.75 میلیارد
    expect(r.payable).toBe(5_250_000_000);
  });

  it("روش درصدی", () => {
    const r = computeSiteSetup({
      method: "percentage",
      approvedAmount: 0,
      percent: 0.025,
      setupProgress: 0,
      dismantleProgress: 0,
      cumulativeWork: 40_000_000_000,
      contractAmount: 100_000_000_000,
    });
    expect(r.payable).toBe(1_000_000_000);
  });

  it("کسورات و ارزش افزوده", () => {
    const d = computeDeductions(1_000_000_000, 0, {
      insuranceRate: 0.0166,
      taxRate: 0.03,
      vatRate: 0.1,
      prepaymentRate: 0.2,
      performanceBondRate: 0.1,
    });
    expect(d.vat).toBe(100_000_000);
    expect(d.insurance).toBe(16_600_000);
    expect(d.totalDeductions).toBe(16_600_000 + 30_000_000 + 200_000_000 + 100_000_000);
    expect(d.netPayable).toBe(1_100_000_000 - d.totalDeductions);
  });
});
