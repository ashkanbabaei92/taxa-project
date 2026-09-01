/** مرحله ۵: مابه‌التفاوت حمل مصالح (تن-کیلومتر با پله‌های مسافت) */
import { CalculationError, rial, round, sum } from "./numeric";
import type { FinancialRow } from "./types";

export interface ResourceRef {
  id: number;
  code: string;
  title: string;
  unit: string;
  /** تبدیل واحد منبع به تن */
  tonPerUnit: number;
  /** مسافت حمل مشمول قیمت فهرست بها (کیلومتر) */
  freeHaulKm: number;
}

export interface AnalysisRef {
  itemKey: string;
  resourceId: number;
  /** ضریب مصرف منبع به ازای هر واحد ردیف */
  consumptionPerUnit: number;
}

export interface HaulRouteRef {
  resourceId: number;
  origin: string;
  destination: string;
  pavedKm: number;
  unpavedKm: number;
  unpavedEquivalentFactor: number;
}

export interface HaulTier {
  fromKm: number;
  toKm: number | null;
  ratePerTonKm: number;
  title: string;
}

export interface ResourceConsumption {
  resourceId: number;
  code: string;
  title: string;
  unit: string;
  quantity: number;
  tonnage: number;
  contributions: Array<{ itemKey: string; quantity: number; tonnage: number }>;
}

export interface HaulLineResult {
  resourceId: number;
  title: string;
  origin: string;
  destination: string;
  tonnage: number;
  /** مسافت معادل = آسفالته + شوسه × ضریب */
  equivalentKm: number;
  freeHaulKm: number;
  chargeableKm: number;
  tonKm: number;
  tiers: Array<{
    title: string;
    segmentKm: number;
    ratePerTonKm: number;
    amount: number;
  }>;
  amount: number;
}

export interface HaulResult {
  consumptions: ResourceConsumption[];
  lines: HaulLineResult[];
  totalAmount: number;
  totalTonKm: number;
}

/** محاسبه وزن مصالح مصرفی بر اساس ضریب مصرف آنالیز بها */
export function computeResourceConsumption(
  rows: FinancialRow[],
  analysis: AnalysisRef[],
  resources: Map<number, ResourceRef>,
): ResourceConsumption[] {
  const byResource = new Map<number, ResourceConsumption>();
  for (const row of rows) {
    const links = analysis.filter((a) => a.itemKey === row.itemKey);
    for (const link of links) {
      const res = resources.get(link.resourceId);
      if (!res) {
        throw new CalculationError(
          `منبع با شناسه ${link.resourceId} در جدول منابع یافت نشد`,
        );
      }
      let entry = byResource.get(res.id);
      if (!entry) {
        entry = {
          resourceId: res.id,
          code: res.code,
          title: res.title,
          unit: res.unit,
          quantity: 0,
          tonnage: 0,
          contributions: [],
        };
        byResource.set(res.id, entry);
      }
      const quantity = round(row.quantity * link.consumptionPerUnit, 6);
      const tonnage = round(quantity * res.tonPerUnit, 6);
      entry.quantity = round(entry.quantity + quantity, 6);
      entry.tonnage = round(entry.tonnage + tonnage, 6);
      entry.contributions.push({ itemKey: row.itemKey, quantity, tonnage });
    }
  }
  return [...byResource.values()];
}

/** تفکیک مسافت مشمول بین پله‌های بخشنامه حمل */
export function splitIntoTiers(
  chargeableKm: number,
  tiers: HaulTier[],
): Array<{ title: string; segmentKm: number; ratePerTonKm: number }> {
  if (chargeableKm <= 0) return [];
  const ordered = [...tiers].sort((a, b) => a.fromKm - b.fromKm);
  const result: Array<{
    title: string;
    segmentKm: number;
    ratePerTonKm: number;
  }> = [];
  for (const tier of ordered) {
    const upper = tier.toKm ?? Number.POSITIVE_INFINITY;
    if (chargeableKm <= tier.fromKm) break;
    const segmentKm = round(Math.min(chargeableKm, upper) - tier.fromKm, 3);
    if (segmentKm > 0) {
      result.push({
        title: tier.title,
        segmentKm,
        ratePerTonKm: tier.ratePerTonKm,
      });
    }
  }
  return result;
}

/**
 * محاسبه مابه‌التفاوت حمل:
 * مسافت معادل = آسفالته + (شوسه × ضریب معادل)
 * مسافت مشمول = حداکثر(۰، مسافت معادل − مسافت مشمول قیمت پایه)
 * مبلغ = Σ (تناژ × طول پله × نرخ پله)
 */
export function computeHaulage(
  consumptions: ResourceConsumption[],
  routes: HaulRouteRef[],
  resources: Map<number, ResourceRef>,
  tiers: HaulTier[],
): HaulResult {
  const lines: HaulLineResult[] = [];
  for (const consumption of consumptions) {
    const route = routes.find((r) => r.resourceId === consumption.resourceId);
    if (!route) continue;
    const res = resources.get(consumption.resourceId);
    const freeHaulKm = res ? res.freeHaulKm : 0;
    const equivalentKm = round(
      route.pavedKm + route.unpavedKm * route.unpavedEquivalentFactor,
      3,
    );
    const chargeableKm = round(Math.max(equivalentKm - freeHaulKm, 0), 3);
    const tierParts = splitIntoTiers(chargeableKm, tiers).map((t) => ({
      ...t,
      amount: rial(consumption.tonnage * t.segmentKm * t.ratePerTonKm),
    }));
    lines.push({
      resourceId: consumption.resourceId,
      title: consumption.title,
      origin: route.origin,
      destination: route.destination,
      tonnage: consumption.tonnage,
      equivalentKm,
      freeHaulKm,
      chargeableKm,
      tonKm: round(consumption.tonnage * chargeableKm, 4),
      tiers: tierParts,
      amount: rial(sum(tierParts.map((t) => t.amount))),
    });
  }
  return {
    consumptions,
    lines,
    totalAmount: rial(sum(lines.map((l) => l.amount))),
    totalTonKm: round(sum(lines.map((l) => l.tonKm)), 4),
  };
}
