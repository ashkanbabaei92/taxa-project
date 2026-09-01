/**
 * ساختار پایگاه داده سامانه صورت‌وضعیت / تعدیل (منطق نرم‌افزار تکسا)
 * ---------------------------------------------------------------
 * طراحی اصلی برای Microsoft SQL Server انجام شده است، اما در این محیط اجرایی
 * روی PostgreSQL (Drizzle ORM) پیاده‌سازی شده؛ نگاشت انواع داده:
 *   NVARCHAR -> text/varchar , DECIMAL(30,14) -> numeric(30,14) , BIT -> boolean
 */
import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* ۱) درخت پروژه: پروژه مادر -> زیرپروژه -> پیمان                      */
/* ------------------------------------------------------------------ */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    parentId: integer("parent_id"),
    /** parent = پروژه مادر ، project = زیرپروژه/پروژه ، contract = پیمان */
    nodeType: varchar("node_type", { length: 20 }).notNull().default("project"),
    code: varchar("code", { length: 50 }).notNull(),
    title: text("title").notNull(),
    employer: text("employer"),
    contractor: text("contractor"),
    consultant: text("consultant"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("projects_parent_idx").on(t.parentId)],
);

/** پیمان: اطلاعات قراردادی، ضریب تعدیل و شاخص مبنا */
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  contractNo: varchar("contract_no", { length: 60 }).notNull(),
  title: text("title").notNull(),
  priceBookId: integer("price_book_id"),
  /** تاریخ‌های شمسی به صورت YYYY/MM/DD */
  startDate: varchar("start_date", { length: 10 }).notNull(),
  allowedEndDate: varchar("allowed_end_date", { length: 10 }).notNull(),
  /** مبلغ اولیه پیمان */
  initialAmount: numeric("initial_amount", { precision: 24, scale: 4 })
    .notNull()
    .default("0"),
  /** ضریب تعدیل پیمان d (معمولاً ۰.۹۵) */
  adjustmentFactorD: numeric("adjustment_factor_d", { precision: 10, scale: 6 })
    .notNull()
    .default("0.95"),
  /** شاخص مبنا: سال و سه‌ماهه مبنای پیمان */
  baseIndexYear: integer("base_index_year").notNull(),
  baseIndexQuarter: integer("base_index_quarter").notNull(),
  /** نرخ‌های کسورات */
  insuranceRate: numeric("insurance_rate", { precision: 8, scale: 5 })
    .notNull()
    .default("0.0166"),
  taxRate: numeric("tax_rate", { precision: 8, scale: 5 })
    .notNull()
    .default("0.03"),
  vatRate: numeric("vat_rate", { precision: 8, scale: 5 })
    .notNull()
    .default("0.10"),
  prepaymentRate: numeric("prepayment_rate", { precision: 8, scale: 5 })
    .notNull()
    .default("0.20"),
  performanceBondRate: numeric("performance_bond_rate", {
    precision: 8,
    scale: 5,
  })
    .notNull()
    .default("0.10"),
  /** روش تجهیز کارگاه: p35_35_30 یا percentage */
  siteSetupMethod: varchar("site_setup_method", { length: 20 })
    .notNull()
    .default("p35_35_30"),
  siteSetupApprovedAmount: numeric("site_setup_amount", {
    precision: 24,
    scale: 4,
  })
    .notNull()
    .default("0"),
  siteSetupPercent: numeric("site_setup_percent", { precision: 8, scale: 5 })
    .notNull()
    .default("0"),
});

/** دوره صورت وضعیت (نسخه پیمانکار / مشاور / کارفرما) */
export const statements = pgTable(
  "statements",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id").notNull(),
    periodNo: integer("period_no").notNull(),
    /** contractor | consultant | employer */
    version: varchar("version", { length: 20 }).notNull().default("contractor"),
    title: text("title").notNull(),
    fromDate: varchar("from_date", { length: 10 }).notNull(),
    toDate: varchar("to_date", { length: 10 }).notNull(),
    /** مبلغ ناخالص تجمعی صورت وضعیت قبلی (برای محاسبه کارکرد دوره) */
    previousGrossAmount: numeric("previous_gross", { precision: 24, scale: 4 })
      .notNull()
      .default("0"),
    isCumulative: boolean("is_cumulative").notNull().default(true),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("statements_contract_idx").on(t.contractId)],
);

/* ------------------------------------------------------------------ */
/* ۲) جداول پایه: دفترچه، فصول، ردیف‌های فهرست بها                     */
/* ------------------------------------------------------------------ */
export const priceBooks = pgTable("price_books", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  /** ضریب بالاسری پیش‌فرض دفترچه: 1.41 یا 1.30 */
  overheadFactor: numeric("overhead_factor", { precision: 10, scale: 6 })
    .notNull()
    .default("1.41"),
});

export const chapters = pgTable(
  "chapters",
  {
    id: serial("id").primaryKey(),
    priceBookId: integer("price_book_id").notNull(),
    chapterNo: integer("chapter_no").notNull(),
    title: text("title").notNull(),
  },
  (t) => [index("chapters_book_idx").on(t.priceBookId)],
);

export const priceItems = pgTable(
  "price_items",
  {
    id: serial("id").primaryKey(),
    priceBookId: integer("price_book_id").notNull(),
    chapterId: integer("chapter_id").notNull(),
    code: varchar("code", { length: 30 }).notNull(),
    fullDescription: text("full_description").notNull(),
    shortDescription: text("short_description").notNull(),
    unit: varchar("unit", { length: 30 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 24, scale: 4 }).notNull(),
  },
  (t) => [
    index("price_items_book_idx").on(t.priceBookId),
    index("price_items_code_idx").on(t.code),
  ],
);

/** ضرایب منطقه‌ای استان‌ها */
export const regionalFactors = pgTable("regional_factors", {
  id: serial("id").primaryKey(),
  provinceCode: varchar("province_code", { length: 10 }).notNull(),
  provinceName: text("province_name").notNull(),
  factor: numeric("factor", { precision: 10, scale: 6 }).notNull(),
});

/** شاخص‌های تعدیل سه‌ماهه (کل دفترچه یا به تفکیک فصل) */
export const adjustmentIndices = pgTable(
  "adjustment_indices",
  {
    id: serial("id").primaryKey(),
    priceBookId: integer("price_book_id").notNull(),
    chapterNo: integer("chapter_no"), // null = شاخص کلی دفترچه
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(),
    indexValue: numeric("index_value", { precision: 18, scale: 4 }).notNull(),
  },
  (t) => [index("adj_idx_book_year").on(t.priceBookId, t.year, t.quarter)],
);

/* ------------------------------------------------------------------ */
/* ۳) آنالیز بها و منابع + مسافت حمل                                   */
/* ------------------------------------------------------------------ */
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  title: text("title").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  /** تبدیل واحد منبع به تن برای محاسبه تن-کیلومتر */
  tonPerUnit: numeric("ton_per_unit", { precision: 18, scale: 8 })
    .notNull()
    .default("1"),
  /** مسافت حمل مشمول در قیمت فهرست بها (کیلومتر) */
  freeHaulKm: numeric("free_haul_km", { precision: 10, scale: 3 })
    .notNull()
    .default("30"),
});

/** آنالیز بها: ضریب مصرف منبع در هر واحد ردیف فهرست بها */
export const itemAnalysis = pgTable(
  "item_analysis",
  {
    id: serial("id").primaryKey(),
    priceItemId: integer("price_item_id").notNull(),
    resourceId: integer("resource_id").notNull(),
    consumptionPerUnit: numeric("consumption_per_unit", {
      precision: 18,
      scale: 8,
    }).notNull(),
  },
  (t) => [index("item_analysis_item_idx").on(t.priceItemId)],
);

/** مسافت حمل مصالح از مبدأ تا مقصد برای هر پیمان */
export const haulRoutes = pgTable(
  "haul_routes",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id").notNull(),
    resourceId: integer("resource_id").notNull(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    /** مسافت راه آسفالته */
    pavedKm: numeric("paved_km", { precision: 10, scale: 3 })
      .notNull()
      .default("0"),
    /** مسافت راه شوسه/خاکی (با ضریب معادل‌سازی) */
    unpavedKm: numeric("unpaved_km", { precision: 10, scale: 3 })
      .notNull()
      .default("0"),
    unpavedEquivalentFactor: numeric("unpaved_factor", {
      precision: 10,
      scale: 4,
    })
      .notNull()
      .default("2"),
  },
  (t) => [index("haul_routes_contract_idx").on(t.contractId)],
);

/** پله‌های مسافت بخشنامه حمل (نرخ ریال بر تن-کیلومتر) */
export const haulTiers = pgTable("haul_tiers", {
  id: serial("id").primaryKey(),
  fromKm: numeric("from_km", { precision: 10, scale: 3 }).notNull(),
  toKm: numeric("to_km", { precision: 10, scale: 3 }), // null = بی‌نهایت
  ratePerTonKm: numeric("rate_per_ton_km", {
    precision: 18,
    scale: 4,
  }).notNull(),
  title: text("title").notNull(),
});

/* ------------------------------------------------------------------ */
/* ۴) ریزمتره / خلاصه متره / برگه مالی                                  */
/* ------------------------------------------------------------------ */
/** موقعیت‌های اجرایی با ضریب موقعیت */
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull(),
  title: text("title").notNull(),
  positionFactor: numeric("position_factor", { precision: 12, scale: 6 })
    .notNull()
    .default("1"),
});

/** ریزمتره */
export const detailQuantities = pgTable(
  "detail_quantities",
  {
    id: serial("id").primaryKey(),
    statementId: integer("statement_id").notNull(),
    priceItemId: integer("price_item_id"),
    /** برای آیتم‌های غیر فهرست‌بهایی */
    customItemId: integer("custom_item_id"),
    locationId: integer("location_id"),
    description: text("description").notNull().default(""),
    pageRef: varchar("page_ref", { length: 40 }).notNull().default(""),
    /** تعداد × طول × عرض × ارتفاع (وزن جایگزین حاصل‌ضرب هندسی می‌شود) */
    countQty: numeric("count_qty", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    length: numeric("length", { precision: 18, scale: 6 }),
    width: numeric("width", { precision: 18, scale: 6 }),
    height: numeric("height", { precision: 18, scale: 6 }),
    weight: numeric("weight", { precision: 18, scale: 6 }),
    /** علامت + یا - (کسر مقدار) */
    sign: integer("sign").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("detail_statement_idx").on(t.statementId)],
);

/**
 * آیتم‌های غیر فهرست بها:
 * star = ستاره‌دار ، invoice = فاکتوری ، onsite = مصالح پای‌کار ،
 * adjust = اضافه/کسر بها (کد مرتبط)
 */
export const customItems = pgTable(
  "custom_items",
  {
    id: serial("id").primaryKey(),
    statementId: integer("statement_id").notNull(),
    itemType: varchar("item_type", { length: 20 }).notNull(),
    chapterNo: integer("chapter_no").notNull().default(0),
    code: varchar("code", { length: 40 }).notNull(),
    description: text("description").notNull(),
    unit: varchar("unit", { length: 30 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 24, scale: 4 }).notNull(),
    /** برای اضافه/کسر بها: کد ردیف مرتبط و درصد */
    relatedItemCode: varchar("related_item_code", { length: 30 }),
    percent: numeric("percent", { precision: 12, scale: 6 }),
    /** آیا مشمول ضرایب پیمان می‌شود؟ (فاکتوری/پای‌کار معمولاً خیر) */
    applyCoefficients: boolean("apply_coefficients").notNull().default(true),
    /** آیا مشمول تعدیل می‌شود؟ */
    applyAdjustment: boolean("apply_adjustment").notNull().default(true),
  },
  (t) => [index("custom_items_statement_idx").on(t.statementId)],
);

/* ------------------------------------------------------------------ */
/* ۵) ضرایب پیمان                                                      */
/* ------------------------------------------------------------------ */
export const contractCoefficients = pgTable(
  "contract_coefficients",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id").notNull(),
    /** proposal | regional | height | floors | difficulty | overhead | custom */
    kind: varchar("kind", { length: 25 }).notNull(),
    title: text("title").notNull(),
    /** تا ۱۴ رقم اعشار */
    value: numeric("value", { precision: 30, scale: 14 }).notNull(),
    /** all = کل دفترچه ، chapter = فقط یک فصل */
    scope: varchar("scope", { length: 15 }).notNull().default("all"),
    chapterNo: integer("chapter_no"),
    /** آیا در محاسبه تعدیل هم لحاظ می‌شود */
    includeInAdjustment: boolean("include_in_adjustment")
      .notNull()
      .default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("coef_contract_idx").on(t.contractId)],
);
