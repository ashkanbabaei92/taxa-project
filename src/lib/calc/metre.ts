/** مرحله ۱ و ۲: ریزمتره و خلاصه متره */
import { CalculationError, round, toNumber } from "./numeric";
import type {
  CatalogItem,
  DetailRowInput,
  DetailRowResult,
  LocationRef,
  SummaryRow,
} from "./types";

/**
 * محاسبه جمع کل یک سطر ریزمتره.
 * جمع = علامت × تعداد × (حاصل‌ضرب ابعاد وارد شده)
 * ابعاد خالی (null) در حاصل‌ضرب بی‌اثر هستند (معادل ۱).
 */
export function computeDetailRow(
  row: DetailRowInput,
  decimals = 4,
): DetailRowResult {
  const count = toNumber(row.countQty, 0, "تعداد");
  const dims = [row.length, row.width, row.height, row.weight]
    .filter((v) => v !== null && v !== undefined)
    .map((v) => toNumber(v, 1, "بعد ریزمتره"));
  const dimensionProduct = dims.reduce((a, b) => a * b, 1);
  const sign = row.sign === -1 ? -1 : 1;
  if (!Number.isFinite(count * dimensionProduct)) {
    throw new CalculationError(`مقادیر سطر ریزمتره ${row.id} نامعتبر است`);
  }
  return {
    ...row,
    sign,
    dimensionProduct: round(dimensionProduct, decimals),
    total: round(sign * count * dimensionProduct, decimals),
  };
}

export function computeDetailRows(rows: DetailRowInput[]): DetailRowResult[] {
  return rows.map((r) => computeDetailRow(r));
}

/**
 * خلاصه متره: تجمیع ردیف‌های یکسان از موقعیت‌های مختلف
 * و اعمال ضریب موقعیت روی مقدار هر موقعیت.
 */
export function buildSummary(
  rows: DetailRowResult[],
  catalog: Map<string, CatalogItem>,
  locations: Map<number, LocationRef>,
  decimals = 4,
): SummaryRow[] {
  const grouped = new Map<string, SummaryRow>();

  for (const row of rows) {
    const item = catalog.get(row.itemKey);
    if (!item) {
      throw new CalculationError(
        `ردیف «${row.itemKey}» در فهرست بها یا آیتم‌های دلخواه یافت نشد`,
      );
    }
    const loc = row.locationId ? locations.get(row.locationId) : undefined;
    const positionFactor = loc ? toNumber(loc.positionFactor, 1) : 1;
    const locationTitle = loc?.title ?? "بدون موقعیت";

    let summary = grouped.get(row.itemKey);
    if (!summary) {
      summary = {
        itemKey: row.itemKey,
        code: item.code,
        chapterNo: item.chapterNo,
        unit: item.unit,
        description: item.shortDescription || item.description,
        rawQuantity: 0,
        quantity: 0,
        breakdown: [],
      };
      grouped.set(row.itemKey, summary);
    }

    let bucket = summary.breakdown.find(
      (b) => b.locationId === (row.locationId ?? null),
    );
    if (!bucket) {
      bucket = {
        locationId: row.locationId ?? null,
        locationTitle,
        positionFactor,
        rawQuantity: 0,
        quantity: 0,
      };
      summary.breakdown.push(bucket);
    }
    bucket.rawQuantity = round(bucket.rawQuantity + row.total, decimals);
    bucket.quantity = round(bucket.rawQuantity * positionFactor, decimals);
  }

  for (const summary of grouped.values()) {
    summary.rawQuantity = round(
      summary.breakdown.reduce((a, b) => a + b.rawQuantity, 0),
      decimals,
    );
    summary.quantity = round(
      summary.breakdown.reduce((a, b) => a + b.quantity, 0),
      decimals,
    );
  }

  return [...grouped.values()].sort((a, b) =>
    a.chapterNo === b.chapterNo
      ? a.code.localeCompare(b.code)
      : a.chapterNo - b.chapterNo,
  );
}
