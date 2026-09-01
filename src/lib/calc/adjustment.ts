/**
 * موتور محاسبه تعدیل آحاد بها
 * -------------------------------------------------
 * ۱) انترپوله زمانی کارکرد: تسهیم مبلغ کارکرد دوره بین سه‌ماهه‌ها بر اساس
 *    تعداد روزهای کارکرد در هر سه‌ماهه (بین تاریخ صورت وضعیت قبلی و فعلی،
 *    محدود شده به تاریخ شروع به کار و تاریخ خاتمه مجاز).
 * ۲) ضریب تعدیل:  E = d × ( It / I0 − 1 )
 * ۳) مبلغ تعدیل فصل = مبلغ کارکرد دوره فصل × E
 */
import {
  compareJalali,
  maxJalali,
  quarterKey,
  quarterOf,
  splitPeriodIntoQuarters,
} from "./jalali";
import { CalculationError, rial, round, safeDivide, sum } from "./numeric";

export interface AdjustmentContract {
  startDate: string;
  allowedEndDate: string;
  /** ضریب پیمان d (معمولاً ۰.۹۵) */
  factorD: number;
  baseIndexYear: number;
  baseIndexQuarter: number;
}

export interface IndexRecord {
  chapterNo: number | null; // null = شاخص کلی
  year: number;
  quarter: number;
  indexValue: number;
}

export interface ChapterWorkAmount {
  chapterNo: number;
  title: string;
  /** کارکرد ناخالص تجمعی این صورت وضعیت (مشمول تعدیل) */
  currentCumulative: number;
  /** کارکرد ناخالص تجمعی صورت وضعیت قبلی */
  previousCumulative: number;
}

export interface QuarterAllocation {
  year: number;
  quarter: number;
  label: string;
  spanStart: string;
  spanEnd: string;
  days: number;
  weight: number;
  /** آیا شاخص به دلیل عبور از خاتمه مجاز فریز شده است */
  frozenAfterAllowedEnd: boolean;
  effectiveYear: number;
  effectiveQuarter: number;
}

export interface ChapterAdjustmentRow {
  chapterNo: number;
  title: string;
  periodWork: number;
  quarters: Array<{
    label: string;
    days: number;
    weight: number;
    allocatedWork: number;
    baseIndex: number;
    currentIndex: number;
    E: number;
    amount: number;
  }>;
  totalAdjustment: number;
  /** ضریب تعدیل مؤثر وزنی فصل */
  effectiveE: number;
}

export interface AdjustmentResult {
  periodStart: string;
  periodEnd: string;
  totalDays: number;
  allocations: QuarterAllocation[];
  chapters: ChapterAdjustmentRow[];
  totalPeriodWork: number;
  totalAdjustment: number;
  baseIndexLabel: string;
}

function findIndex(
  indices: IndexRecord[],
  chapterNo: number,
  year: number,
  quarter: number,
): number {
  const exact = indices.find(
    (i) => i.chapterNo === chapterNo && i.year === year && i.quarter === quarter,
  );
  if (exact) return exact.indexValue;
  const general = indices.find(
    (i) => i.chapterNo === null && i.year === year && i.quarter === quarter,
  );
  if (general) return general.indexValue;
  throw new CalculationError(
    `شاخص تعدیل برای فصل ${chapterNo} در دوره ${year}-Q${quarter} تعریف نشده است`,
  );
}

/** تسهیم روزهای کارکرد دوره بین سه‌ماهه‌ها (انترپوله زمانی) */
export function allocateQuarters(
  contract: AdjustmentContract,
  periodFrom: string,
  periodTo: string,
): { allocations: QuarterAllocation[]; totalDays: number } {
  // بازه کارکرد نمی‌تواند قبل از تاریخ شروع به کار پیمان باشد
  const start = maxJalali(periodFrom, contract.startDate);
  if (compareJalali(start, periodTo) > 0) {
    throw new CalculationError(
      `بازه کارکرد نامعتبر است: از ${start} تا ${periodTo}`,
    );
  }
  const allowedEndQuarter = quarterOf(contract.allowedEndDate);
  const spans = splitPeriodIntoQuarters(start, periodTo);
  const totalDays = sum(spans.map((s) => s.days));
  if (totalDays <= 0) {
    throw new CalculationError("تعداد روزهای کارکرد دوره صفر است");
  }
  const allocations = spans.map((s) => {
    // کارکرد پس از خاتمه مجاز: شاخص همان سه‌ماهه خاتمه مجاز اعمال می‌شود
    const afterAllowedEnd = compareJalali(s.spanStart, contract.allowedEndDate) > 0;
    return {
      year: s.year,
      quarter: s.quarter,
      label: quarterKey(s.year, s.quarter),
      spanStart: s.spanStart,
      spanEnd: s.spanEnd,
      days: s.days,
      weight: round(safeDivide(s.days, totalDays, "تعداد کل روزها"), 10),
      frozenAfterAllowedEnd: afterAllowedEnd,
      effectiveYear: afterAllowedEnd ? allowedEndQuarter.year : s.year,
      effectiveQuarter: afterAllowedEnd
        ? allowedEndQuarter.quarter
        : s.quarter,
    };
  });
  return { allocations, totalDays };
}

/** ضریب تعدیل  E = d × (It / I0 − 1) */
export function adjustmentFactorE(
  currentIndex: number,
  baseIndex: number,
  factorD: number,
): number {
  if (baseIndex <= 0) {
    throw new CalculationError("شاخص مبنا باید بزرگ‌تر از صفر باشد");
  }
  return round(factorD * (currentIndex / baseIndex - 1), 10);
}

export function computeAdjustment(
  contract: AdjustmentContract,
  periodFrom: string,
  periodTo: string,
  chapterAmounts: ChapterWorkAmount[],
  indices: IndexRecord[],
): AdjustmentResult {
  const { allocations, totalDays } = allocateQuarters(
    contract,
    periodFrom,
    periodTo,
  );

  const chapters: ChapterAdjustmentRow[] = chapterAmounts.map((chapter) => {
    const periodWork = rial(
      chapter.currentCumulative - chapter.previousCumulative,
    );
    const baseIndex = findIndex(
      indices,
      chapter.chapterNo,
      contract.baseIndexYear,
      contract.baseIndexQuarter,
    );
    const quarters = allocations.map((a) => {
      const currentIndex = findIndex(
        indices,
        chapter.chapterNo,
        a.effectiveYear,
        a.effectiveQuarter,
      );
      const E = adjustmentFactorE(currentIndex, baseIndex, contract.factorD);
      const allocatedWork = rial(periodWork * a.weight);
      return {
        label: a.label,
        days: a.days,
        weight: a.weight,
        allocatedWork,
        baseIndex,
        currentIndex,
        E,
        amount: rial(allocatedWork * E),
      };
    });
    const totalAdjustment = rial(sum(quarters.map((q) => q.amount)));
    return {
      chapterNo: chapter.chapterNo,
      title: chapter.title,
      periodWork,
      quarters,
      totalAdjustment,
      effectiveE:
        periodWork !== 0 ? round(totalAdjustment / periodWork, 10) : 0,
    };
  });

  return {
    periodStart: maxJalali(periodFrom, contract.startDate),
    periodEnd: periodTo,
    totalDays,
    allocations,
    chapters,
    totalPeriodWork: rial(sum(chapters.map((c) => c.periodWork))),
    totalAdjustment: rial(sum(chapters.map((c) => c.totalAdjustment))),
    baseIndexLabel: quarterKey(
      contract.baseIndexYear,
      contract.baseIndexQuarter,
    ),
  };
}
