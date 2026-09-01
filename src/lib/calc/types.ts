/** انواع داده مشترک موتور محاسبات مالی */

export type ItemType =
  | "normal" // ردیف عادی فهرست بها
  | "star" // ردیف ستاره‌دار
  | "invoice" // ردیف فاکتوری
  | "onsite" // مصالح پای‌کار
  | "adjust"; // اضافه/کسر بها (کد مرتبط)

export interface LocationRef {
  id: number;
  title: string;
  positionFactor: number;
}

export interface DetailRowInput {
  id: number;
  itemKey: string; // شناسه یکتای ردیف (کد فهرست بها یا کد آیتم دلخواه)
  locationId: number | null;
  description: string;
  countQty: number;
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  sign: 1 | -1;
}

export interface DetailRowResult extends DetailRowInput {
  /** حاصل‌ضرب ابعاد */
  dimensionProduct: number;
  /** جمع کل ریزمتره ردیف */
  total: number;
}

export interface CatalogItem {
  itemKey: string;
  code: string;
  chapterNo: number;
  description: string;
  shortDescription: string;
  unit: string;
  unitPrice: number;
  itemType: ItemType;
  applyCoefficients: boolean;
  applyAdjustment: boolean;
  relatedItemCode?: string | null;
  percent?: number | null;
}

export interface SummaryRow {
  itemKey: string;
  code: string;
  chapterNo: number;
  unit: string;
  description: string;
  /** مقدار خام (بدون ضریب موقعیت) */
  rawQuantity: number;
  /** مقدار نهایی پس از اعمال ضریب موقعیت */
  quantity: number;
  breakdown: Array<{
    locationId: number | null;
    locationTitle: string;
    positionFactor: number;
    rawQuantity: number;
    quantity: number;
  }>;
}

export interface FinancialRow extends SummaryRow {
  itemType: ItemType;
  unitPrice: number;
  /** مبلغ خالص = مقدار × قیمت واحد */
  netAmount: number;
  /** ضریب ترکیبی اعمال‌شده */
  coefficient: number;
  /** مبلغ ناخالص = مبلغ خالص × ضریب ترکیبی */
  grossAmount: number;
  applyAdjustment: boolean;
}

export interface ChapterTotal {
  chapterNo: number;
  title: string;
  netAmount: number;
  coefficient: number;
  grossAmount: number;
  adjustableGrossAmount: number;
  rowCount: number;
}

export interface CoefficientInput {
  id: number;
  kind: string;
  title: string;
  value: number;
  scope: "all" | "chapter";
  chapterNo: number | null;
  includeInAdjustment: boolean;
  isActive: boolean;
}
