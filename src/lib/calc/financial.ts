/** مرحله ۳ و ۴ و ۶: برگه مالی، ضرایب پیمان، مبالغ فصول، تجهیز کارگاه و کسورات */
import { CalculationError, multiplyFactors, rial, round, sum } from "./numeric";
import type {
  CatalogItem,
  ChapterTotal,
  CoefficientInput,
  FinancialRow,
  SummaryRow,
} from "./types";

export interface CoefficientBreakdown {
  /** ضریب مشترک همه فصول */
  globalFactor: number;
  /** ضریب مشترکی که در تعدیل نیز اعمال می‌شود */
  globalAdjustableFactor: number;
  perChapter: Map<number, { factor: number; adjustableFactor: number }>;
  applied: CoefficientInput[];
}

/**
 * ترکیب ضرایب پیمان: حاصل‌ضرب ضرایب سطح دفترچه در ضرایب سطح فصل.
 * دقت ضرایب تا ۱۴ رقم اعشار حفظ می‌شود.
 */
export function buildCoefficients(
  coefficients: CoefficientInput[],
  chapterNos: number[],
): CoefficientBreakdown {
  const active = coefficients.filter((c) => c.isActive);
  const globals = active.filter((c) => c.scope === "all");
  const globalFactor = multiplyFactors(globals.map((c) => c.value));
  const globalAdjustableFactor = multiplyFactors(
    globals.filter((c) => c.includeInAdjustment).map((c) => c.value),
  );

  const perChapter = new Map<
    number,
    { factor: number; adjustableFactor: number }
  >();
  const uniqueChapters = new Set<number>(chapterNos);
  for (const c of active) {
    if (c.scope === "chapter" && c.chapterNo !== null) {
      uniqueChapters.add(c.chapterNo);
    }
  }

  for (const chapterNo of uniqueChapters) {
    const chapterCoefs = active.filter(
      (c) => c.scope === "chapter" && c.chapterNo === chapterNo,
    );
    perChapter.set(chapterNo, {
      factor: multiplyFactors([
        globalFactor,
        ...chapterCoefs.map((c) => c.value),
      ]),
      adjustableFactor: multiplyFactors([
        globalAdjustableFactor,
        ...chapterCoefs
          .filter((c) => c.includeInAdjustment)
          .map((c) => c.value),
      ]),
    });
  }

  return {
    globalFactor,
    globalAdjustableFactor,
    perChapter,
    applied: active,
  };
}

export function chapterFactor(
  breakdown: CoefficientBreakdown,
  chapterNo: number,
): { factor: number; adjustableFactor: number } {
  return (
    breakdown.perChapter.get(chapterNo) ?? {
      factor: breakdown.globalFactor,
      adjustableFactor: breakdown.globalAdjustableFactor,
    }
  );
}

/**
 * برگه مالی: مبلغ ردیف = مقدار × قیمت واحد، سپس اعمال ضریب ترکیبی.
 * ردیف‌های اضافه/کسر بها (adjust) بر مبنای درصدی از مبلغ ردیف مرتبط محاسبه می‌شوند.
 */
export function buildFinancialRows(
  summary: SummaryRow[],
  catalog: Map<string, CatalogItem>,
  coefficients: CoefficientBreakdown,
): FinancialRow[] {
  const baseRows: FinancialRow[] = [];

  for (const s of summary) {
    const item = catalog.get(s.itemKey);
    if (!item) {
      throw new CalculationError(`ردیف «${s.itemKey}» در کاتالوگ یافت نشد`);
    }
    if (item.itemType === "adjust") continue; // در گام بعد محاسبه می‌شود

    const netAmount = rial(s.quantity * item.unitPrice);
    const { factor } = chapterFactor(coefficients, item.chapterNo);
    const coefficient = item.applyCoefficients ? factor : 1;
    baseRows.push({
      ...s,
      itemType: item.itemType,
      unitPrice: item.unitPrice,
      netAmount,
      coefficient,
      grossAmount: rial(netAmount * coefficient),
      applyAdjustment: item.applyAdjustment,
    });
  }

  const adjustRows: FinancialRow[] = [];
  for (const s of summary) {
    const item = catalog.get(s.itemKey);
    if (!item || item.itemType !== "adjust") continue;
    const related = item.relatedItemCode
      ? baseRows.find((r) => r.code === item.relatedItemCode)
      : undefined;
    let netAmount: number;
    if (related && item.percent !== null && item.percent !== undefined) {
      // اضافه/کسر بها به صورت درصدی از مبلغ خالص ردیف مرتبط
      netAmount = rial(related.netAmount * item.percent);
    } else {
      netAmount = rial(s.quantity * item.unitPrice);
    }
    const { factor } = chapterFactor(coefficients, item.chapterNo);
    const coefficient = item.applyCoefficients ? factor : 1;
    adjustRows.push({
      ...s,
      itemType: item.itemType,
      unitPrice: item.unitPrice,
      netAmount,
      coefficient,
      grossAmount: rial(netAmount * coefficient),
      applyAdjustment: item.applyAdjustment,
    });
  }

  return [...baseRows, ...adjustRows].sort((a, b) =>
    a.chapterNo === b.chapterNo
      ? a.code.localeCompare(b.code)
      : a.chapterNo - b.chapterNo,
  );
}

export function buildChapterTotals(
  rows: FinancialRow[],
  chapterTitles: Map<number, string>,
  coefficients: CoefficientBreakdown,
): ChapterTotal[] {
  const map = new Map<number, ChapterTotal>();
  for (const row of rows) {
    let entry = map.get(row.chapterNo);
    if (!entry) {
      const { factor } = chapterFactor(coefficients, row.chapterNo);
      entry = {
        chapterNo: row.chapterNo,
        title: chapterTitles.get(row.chapterNo) ?? `فصل ${row.chapterNo}`,
        netAmount: 0,
        coefficient: factor,
        grossAmount: 0,
        adjustableGrossAmount: 0,
        rowCount: 0,
      };
      map.set(row.chapterNo, entry);
    }
    entry.netAmount = rial(entry.netAmount + row.netAmount);
    entry.grossAmount = rial(entry.grossAmount + row.grossAmount);
    if (row.applyAdjustment) {
      const { adjustableFactor } = chapterFactor(coefficients, row.chapterNo);
      entry.adjustableGrossAmount = rial(
        entry.adjustableGrossAmount + row.netAmount * adjustableFactor,
      );
    }
    entry.rowCount += 1;
  }
  return [...map.values()].sort((a, b) => a.chapterNo - b.chapterNo);
}

/* ------------------------- تجهیز و برچیدن کارگاه ------------------------- */
export interface SiteSetupInput {
  method: "p35_35_30" | "percentage";
  approvedAmount: number;
  percent: number;
  /** درصد پیشرفت عملیات تجهیز (۰..۱) */
  setupProgress: number;
  /** درصد پیشرفت برچیدن کارگاه (۰..۱) */
  dismantleProgress: number;
  /** کارکرد ناخالص تجمعی */
  cumulativeWork: number;
  /** مبلغ اولیه پیمان */
  contractAmount: number;
}

export interface SiteSetupResult {
  method: string;
  payable: number;
  parts: Array<{ title: string; ratio: number; amount: number }>;
}

/**
 * روش ۳۵-۳۵-۳۰:
 *  ۳۵٪ به تناسب پیشرفت عملیات تجهیز کارگاه
 *  ۳۵٪ به تناسب نسبت کارکرد به مبلغ پیمان
 *  ۳۰٪ پس از برچیدن کارگاه
 */
export function computeSiteSetup(input: SiteSetupInput): SiteSetupResult {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  if (input.method === "percentage") {
    const amount = rial(input.cumulativeWork * input.percent);
    return {
      method: "درصدی از کارکرد",
      payable: amount,
      parts: [
        { title: "درصدی از کارکرد", ratio: input.percent, amount },
      ],
    };
  }
  const workRatio =
    input.contractAmount > 0
      ? clamp(input.cumulativeWork / input.contractAmount)
      : 0;
  const parts = [
    {
      title: "۳۵٪ پیشرفت عملیات تجهیز",
      ratio: 0.35 * clamp(input.setupProgress),
      amount: 0,
    },
    {
      title: "۳۵٪ به تناسب کارکرد",
      ratio: 0.35 * workRatio,
      amount: 0,
    },
    {
      title: "۳۰٪ برچیدن کارگاه",
      ratio: 0.3 * clamp(input.dismantleProgress),
      amount: 0,
    },
  ].map((p) => ({ ...p, amount: rial(input.approvedAmount * p.ratio) }));

  return {
    method: "۳۵-۳۵-۳۰",
    payable: rial(sum(parts.map((p) => p.amount))),
    parts,
  };
}

/* ------------------------------- کسورات ------------------------------- */
export interface DeductionRates {
  insuranceRate: number;
  taxRate: number;
  vatRate: number;
  prepaymentRate: number;
  performanceBondRate: number;
}

export interface DeductionResult {
  base: number;
  vat: number;
  grossWithVat: number;
  insurance: number;
  tax: number;
  prepaymentRecovery: number;
  performanceBond: number;
  totalDeductions: number;
  netPayable: number;
}

export function computeDeductions(
  base: number,
  previousPaidBase: number,
  rates: DeductionRates,
): DeductionResult {
  if (base < 0) {
    throw new CalculationError("مبلغ مبنای کسورات نمی‌تواند منفی باشد");
  }
  const periodBase = rial(base - previousPaidBase);
  const vat = rial(periodBase * rates.vatRate);
  const insurance = rial(periodBase * rates.insuranceRate);
  const tax = rial(periodBase * rates.taxRate);
  const prepaymentRecovery = rial(periodBase * rates.prepaymentRate);
  const performanceBond = rial(periodBase * rates.performanceBondRate);
  const totalDeductions = rial(
    insurance + tax + prepaymentRecovery + performanceBond,
  );
  return {
    base: periodBase,
    vat,
    grossWithVat: rial(periodBase + vat),
    insurance,
    tax,
    prepaymentRecovery,
    performanceBond,
    totalDeductions,
    netPayable: rial(periodBase + vat - totalDeductions),
  };
}

export function roundPercent(value: number): number {
  return round(value * 100, 3);
}
