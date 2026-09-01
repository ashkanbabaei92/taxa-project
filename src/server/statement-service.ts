import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  adjustmentIndices,
  chapters,
  contractCoefficients,
  contracts,
  customItems,
  detailQuantities,
  haulRoutes,
  haulTiers,
  itemAnalysis,
  locations,
  priceItems,
  projects,
  resources,
  statements,
} from "@/db/schema";
import {
  buildChapterTotals,
  buildCoefficients,
  buildFinancialRows,
  computeDeductions,
  computeSiteSetup,
  type CoefficientBreakdown,
} from "@/lib/calc/financial";
import {
  computeHaulage,
  computeResourceConsumption,
  type AnalysisRef,
  type HaulResult,
  type ResourceRef,
} from "@/lib/calc/haulage";
import { addDays } from "@/lib/calc/jalali";
import { buildSummary, computeDetailRows } from "@/lib/calc/metre";
import { CalculationError, rial, toNumber } from "@/lib/calc/numeric";
import {
  computeAdjustment,
  type AdjustmentResult,
  type ChapterWorkAmount,
  type IndexRecord,
} from "@/lib/calc/adjustment";
import type {
  CatalogItem,
  ChapterTotal,
  CoefficientInput,
  DetailRowInput,
  DetailRowResult,
  FinancialRow,
  ItemType,
  LocationRef,
  SummaryRow,
} from "@/lib/calc/types";

export const PRICE_ITEM_PREFIX = "P";
export const CUSTOM_ITEM_PREFIX = "C";

export interface StatementComputation {
  statement: typeof statements.$inferSelect;
  contract: typeof contracts.$inferSelect;
  project: typeof projects.$inferSelect | null;
  detailRows: Array<DetailRowResult & { locationTitle: string; code: string; unit: string; itemTitle: string }>;
  summary: SummaryRow[];
  financialRows: FinancialRow[];
  chapterTotals: ChapterTotal[];
  coefficients: {
    globalFactor: number;
    globalAdjustableFactor: number;
    list: CoefficientInput[];
  };
  haulage: HaulResult;
  adjustment: AdjustmentResult | null;
  totals: {
    net: number;
    gross: number;
    haulage: number;
    siteSetup: number;
    adjustment: number;
    grandTotal: number;
  };
  siteSetup: ReturnType<typeof computeSiteSetup>;
  deductions: ReturnType<typeof computeDeductions>;
}

interface LoadedContext {
  catalog: Map<string, CatalogItem>;
  locationMap: Map<number, LocationRef>;
  rows: DetailRowInput[];
  rawDetails: Array<typeof detailQuantities.$inferSelect>;
  chapterTitles: Map<number, string>;
  coefficientList: CoefficientInput[];
  analysis: AnalysisRef[];
  resourceMap: Map<number, ResourceRef>;
}

async function loadContext(
  statementId: number,
  contractId: number,
  priceBookId: number | null,
): Promise<LoadedContext> {
  const [details, customs, locs, coefs, chapterRows] = await Promise.all([
    db
      .select()
      .from(detailQuantities)
      .where(eq(detailQuantities.statementId, statementId))
      .orderBy(asc(detailQuantities.id)),
    db.select().from(customItems).where(eq(customItems.statementId, statementId)),
    db.select().from(locations).where(eq(locations.contractId, contractId)),
    db
      .select()
      .from(contractCoefficients)
      .where(eq(contractCoefficients.contractId, contractId))
      .orderBy(asc(contractCoefficients.sortOrder)),
    priceBookId
      ? db.select().from(chapters).where(eq(chapters.priceBookId, priceBookId))
      : Promise.resolve([] as Array<typeof chapters.$inferSelect>),
  ]);

  const priceItemIds = [
    ...new Set(details.map((d) => d.priceItemId).filter((v): v is number => !!v)),
  ];
  const items = priceItemIds.length
    ? await db.select().from(priceItems).where(inArray(priceItems.id, priceItemIds))
    : [];
  const analysisRows = priceItemIds.length
    ? await db
        .select()
        .from(itemAnalysis)
        .where(inArray(itemAnalysis.priceItemId, priceItemIds))
    : [];
  const resourceRows = await db.select().from(resources);

  const chapterById = new Map(chapterRows.map((c) => [c.id, c]));
  const chapterTitles = new Map<number, string>(
    chapterRows.map((c) => [c.chapterNo, c.title]),
  );

  const catalog = new Map<string, CatalogItem>();
  for (const item of items) {
    const chapter = chapterById.get(item.chapterId);
    catalog.set(`${PRICE_ITEM_PREFIX}:${item.id}`, {
      itemKey: `${PRICE_ITEM_PREFIX}:${item.id}`,
      code: item.code,
      chapterNo: chapter?.chapterNo ?? 0,
      description: item.fullDescription,
      shortDescription: item.shortDescription,
      unit: item.unit,
      unitPrice: toNumber(item.unitPrice, 0, "قیمت واحد"),
      itemType: "normal",
      applyCoefficients: true,
      applyAdjustment: true,
    });
  }
  for (const c of customs) {
    catalog.set(`${CUSTOM_ITEM_PREFIX}:${c.id}`, {
      itemKey: `${CUSTOM_ITEM_PREFIX}:${c.id}`,
      code: c.code,
      chapterNo: c.chapterNo,
      description: c.description,
      shortDescription: c.description,
      unit: c.unit,
      unitPrice: toNumber(c.unitPrice, 0, "قیمت واحد"),
      itemType: c.itemType as ItemType,
      applyCoefficients: c.applyCoefficients,
      applyAdjustment: c.applyAdjustment,
      relatedItemCode: c.relatedItemCode,
      percent: c.percent === null ? null : toNumber(c.percent, 0),
    });
    if (!chapterTitles.has(c.chapterNo)) {
      chapterTitles.set(c.chapterNo, `فصل ${c.chapterNo} (آیتم‌های خارج فهرست)`);
    }
  }

  const rows: DetailRowInput[] = details.map((d) => ({
    id: d.id,
    itemKey: d.priceItemId
      ? `${PRICE_ITEM_PREFIX}:${d.priceItemId}`
      : `${CUSTOM_ITEM_PREFIX}:${d.customItemId}`,
    locationId: d.locationId,
    description: d.description,
    countQty: toNumber(d.countQty, 0, "تعداد"),
    length: d.length === null ? null : toNumber(d.length),
    width: d.width === null ? null : toNumber(d.width),
    height: d.height === null ? null : toNumber(d.height),
    weight: d.weight === null ? null : toNumber(d.weight),
    sign: d.sign === -1 ? -1 : 1,
  }));

  return {
    catalog,
    locationMap: new Map(
      locs.map((l) => [
        l.id,
        { id: l.id, title: l.title, positionFactor: toNumber(l.positionFactor, 1) },
      ]),
    ),
    rows,
    rawDetails: details,
    chapterTitles,
    coefficientList: coefs.map((c) => ({
      id: c.id,
      kind: c.kind,
      title: c.title,
      value: toNumber(c.value, 1, `ضریب ${c.title}`),
      scope: c.scope === "chapter" ? "chapter" : "all",
      chapterNo: c.chapterNo,
      includeInAdjustment: c.includeInAdjustment,
      isActive: c.isActive,
    })),
    analysis: analysisRows.map((a) => ({
      itemKey: `${PRICE_ITEM_PREFIX}:${a.priceItemId}`,
      resourceId: a.resourceId,
      consumptionPerUnit: toNumber(a.consumptionPerUnit, 0, "ضریب مصرف"),
    })),
    resourceMap: new Map(
      resourceRows.map((r) => [
        r.id,
        {
          id: r.id,
          code: r.code,
          title: r.title,
          unit: r.unit,
          tonPerUnit: toNumber(r.tonPerUnit, 1),
          freeHaulKm: toNumber(r.freeHaulKm, 0),
        },
      ]),
    ),
  };
}

function financialPipeline(ctx: LoadedContext): {
  summary: SummaryRow[];
  rows: FinancialRow[];
  totals: ChapterTotal[];
  breakdown: CoefficientBreakdown;
  detailResults: DetailRowResult[];
} {
  const detailResults = computeDetailRows(ctx.rows);
  const summary = buildSummary(detailResults, ctx.catalog, ctx.locationMap);
  const chapterNos = [...new Set(summary.map((s) => s.chapterNo))];
  const breakdown = buildCoefficients(ctx.coefficientList, chapterNos);
  const rows = buildFinancialRows(summary, ctx.catalog, breakdown);
  const totals = buildChapterTotals(rows, ctx.chapterTitles, breakdown);
  return { summary, rows, totals, breakdown, detailResults };
}

/** مبالغ فصول یک صورت وضعیت (برای محاسبه کارکرد دوره نسبت به صورت وضعیت قبلی) */
export async function computeChapterTotalsFor(
  statementId: number,
): Promise<ChapterTotal[]> {
  const [stmt] = await db
    .select()
    .from(statements)
    .where(eq(statements.id, statementId));
  if (!stmt) return [];
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, stmt.contractId));
  if (!contract) return [];
  const ctx = await loadContext(stmt.id, contract.id, contract.priceBookId);
  return financialPipeline(ctx).totals;
}

export async function computeStatement(
  statementId: number,
): Promise<StatementComputation> {
  const [stmt] = await db
    .select()
    .from(statements)
    .where(eq(statements.id, statementId));
  if (!stmt) {
    throw new CalculationError(`صورت وضعیت با شناسه ${statementId} یافت نشد`);
  }
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, stmt.contractId));
  if (!contract) {
    throw new CalculationError("پیمان مرتبط با این صورت وضعیت یافت نشد");
  }
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, contract.projectId));

  const ctx = await loadContext(stmt.id, contract.id, contract.priceBookId);
  const { summary, rows, totals, breakdown, detailResults } = financialPipeline(ctx);

  /* --- حمل مصالح --- */
  const routes = await db
    .select()
    .from(haulRoutes)
    .where(eq(haulRoutes.contractId, contract.id));
  const tiers = await db.select().from(haulTiers).orderBy(asc(haulTiers.fromKm));
  const consumptions = computeResourceConsumption(
    rows,
    ctx.analysis,
    ctx.resourceMap,
  );
  const haulage = computeHaulage(
    consumptions,
    routes.map((r) => ({
      resourceId: r.resourceId,
      origin: r.origin,
      destination: r.destination,
      pavedKm: toNumber(r.pavedKm, 0),
      unpavedKm: toNumber(r.unpavedKm, 0),
      unpavedEquivalentFactor: toNumber(r.unpavedEquivalentFactor, 1),
    })),
    ctx.resourceMap,
    tiers.map((t) => ({
      fromKm: toNumber(t.fromKm, 0),
      toKm: t.toKm === null ? null : toNumber(t.toKm),
      ratePerTonKm: toNumber(t.ratePerTonKm, 0),
      title: t.title,
    })),
  );

  /* --- تعدیل --- */
  const [previousStatement] = await db
    .select()
    .from(statements)
    .where(
      and(
        eq(statements.contractId, contract.id),
        eq(statements.version, stmt.version),
        lt(statements.periodNo, stmt.periodNo),
      ),
    )
    .orderBy(desc(statements.periodNo))
    .limit(1);

  const previousTotals = previousStatement
    ? await computeChapterTotalsFor(previousStatement.id)
    : [];
  const prevByChapter = new Map(
    previousTotals.map((t) => [t.chapterNo, t.adjustableGrossAmount]),
  );

  const indexRows = contract.priceBookId
    ? await db
        .select()
        .from(adjustmentIndices)
        .where(eq(adjustmentIndices.priceBookId, contract.priceBookId))
    : [];
  const indices: IndexRecord[] = indexRows.map((i) => ({
    chapterNo: i.chapterNo,
    year: i.year,
    quarter: i.quarter,
    indexValue: toNumber(i.indexValue, 0, "شاخص تعدیل"),
  }));

  const chapterWork: ChapterWorkAmount[] = totals.map((t) => ({
    chapterNo: t.chapterNo,
    title: t.title,
    currentCumulative: t.adjustableGrossAmount,
    previousCumulative: prevByChapter.get(t.chapterNo) ?? 0,
  }));

  let adjustment: AdjustmentResult | null = null;
  if (indices.length && chapterWork.length) {
    try {
      adjustment = computeAdjustment(
        {
          startDate: contract.startDate,
          allowedEndDate: contract.allowedEndDate,
          factorD: toNumber(contract.adjustmentFactorD, 0.95),
          baseIndexYear: contract.baseIndexYear,
          baseIndexQuarter: contract.baseIndexQuarter,
        },
        // بازه کارکرد دوره: از روز بعد از تاریخ صورت وضعیت قبلی تا تاریخ فعلی
        previousStatement
          ? addDays(previousStatement.toDate, 1)
          : contract.startDate,
        stmt.toDate,
        chapterWork,
        indices,
      );
    } catch (error) {
      adjustment = null;
      if (process.env.NODE_ENV !== "production") {
        console.warn("adjustment skipped:", (error as Error).message);
      }
    }
  }

  /* --- تجهیز کارگاه و کسورات --- */
  const grossWork = rial(totals.reduce((a, t) => a + t.grossAmount, 0));
  const netWork = rial(totals.reduce((a, t) => a + t.netAmount, 0));
  const siteSetup = computeSiteSetup({
    method: contract.siteSetupMethod === "percentage" ? "percentage" : "p35_35_30",
    approvedAmount: toNumber(contract.siteSetupApprovedAmount, 0),
    percent: toNumber(contract.siteSetupPercent, 0),
    setupProgress: 1,
    dismantleProgress: 0,
    cumulativeWork: grossWork,
    contractAmount: toNumber(contract.initialAmount, 0),
  });

  const grandTotal = rial(
    grossWork +
      haulage.totalAmount +
      siteSetup.payable +
      (adjustment?.totalAdjustment ?? 0),
  );

  const deductions = computeDeductions(
    grandTotal,
    toNumber(stmt.previousGrossAmount, 0),
    {
      insuranceRate: toNumber(contract.insuranceRate, 0),
      taxRate: toNumber(contract.taxRate, 0),
      vatRate: toNumber(contract.vatRate, 0),
      prepaymentRate: toNumber(contract.prepaymentRate, 0),
      performanceBondRate: toNumber(contract.performanceBondRate, 0),
    },
  );

  const locationTitle = (id: number | null) =>
    id ? ctx.locationMap.get(id)?.title ?? "بدون موقعیت" : "بدون موقعیت";

  return {
    statement: stmt,
    contract,
    project: project ?? null,
    detailRows: detailResults.map((d) => {
      const item = ctx.catalog.get(d.itemKey);
      return {
        ...d,
        locationTitle: locationTitle(d.locationId),
        code: item?.code ?? "-",
        unit: item?.unit ?? "-",
        itemTitle: item?.shortDescription ?? "-",
      };
    }),
    summary,
    financialRows: rows,
    chapterTotals: totals,
    coefficients: {
      globalFactor: breakdown.globalFactor,
      globalAdjustableFactor: breakdown.globalAdjustableFactor,
      list: ctx.coefficientList,
    },
    haulage,
    adjustment,
    totals: {
      net: netWork,
      gross: grossWork,
      haulage: haulage.totalAmount,
      siteSetup: siteSetup.payable,
      adjustment: adjustment?.totalAdjustment ?? 0,
      grandTotal,
    },
    siteSetup,
    deductions,
  };
}
