import { sql } from "drizzle-orm";
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
  priceBooks,
  priceItems,
  projects,
  regionalFactors,
  resources,
  statements,
} from "@/db/schema";

export async function isSeeded(): Promise<boolean> {
  const rows = await db.select({ id: projects.id }).from(projects).limit(1);
  return rows.length > 0;
}

export async function resetDatabase(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE detail_quantities, custom_items, locations, haul_routes,
      contract_coefficients, statements, contracts, projects, item_analysis,
      price_items, chapters, adjustment_indices, price_books, resources,
      haul_tiers, regional_factors RESTART IDENTITY CASCADE
  `);
}

export async function seedDatabase(): Promise<{ statementId: number; rootProjectId: number }> {
  await resetDatabase();

  /* ---------------- فهرست بهای پایه ---------------- */
  const [book] = await db
    .insert(priceBooks)
    .values({
      code: "ABNIEH-1403",
      title: "فهرست بهای واحد پایه رشته ابنیه سال ۱۴۰۳",
      year: 1403,
      overheadFactor: "1.41",
    })
    .returning();

  const chapterDefs = [
    { chapterNo: 3, title: "فصل سوم - عملیات خاکی با ماشین" },
    { chapterNo: 7, title: "فصل هفتم - قالب‌بندی چوبی" },
    { chapterNo: 8, title: "فصل هشتم - قالب‌بندی فلزی" },
    { chapterNo: 9, title: "فصل نهم - کارهای فولادی با میلگرد" },
    { chapterNo: 10, title: "فصل دهم - بتن درجا" },
    { chapterNo: 11, title: "فصل یازدهم - بتن پیش‌ساخته و بلوک" },
  ];
  const chapterRows = await db
    .insert(chapters)
    .values(chapterDefs.map((c) => ({ ...c, priceBookId: book.id })))
    .returning();
  const chapterId = (no: number) =>
    chapterRows.find((c) => c.chapterNo === no)!.id;

  const itemDefs = [
    {
      chapterNo: 3,
      code: "030101",
      fullDescription:
        "خاک‌برداری در زمین‌های نرم با ماشین و ریختن مواد حاصل به کنار محل عملیات",
      shortDescription: "خاک‌برداری ماشینی زمین نرم",
      unit: "مترمکعب",
      unitPrice: "245000",
    },
    {
      chapterNo: 3,
      code: "030502",
      fullDescription:
        "خاک‌ریزی با خاک محل یا خاک آورده شده، شامل پخش، آبپاشی و کوبیدن لایه‌ای",
      shortDescription: "خاک‌ریزی و کوبیدن لایه‌ای",
      unit: "مترمکعب",
      unitPrice: "318000",
    },
    {
      chapterNo: 8,
      code: "080101",
      fullDescription: "تهیه و نصب قالب فلزی برای پی و شالوده و شناژ",
      shortDescription: "قالب فلزی پی و شناژ",
      unit: "مترمربع",
      unitPrice: "1150000",
    },
    {
      chapterNo: 8,
      code: "080301",
      fullDescription: "تهیه و نصب قالب فلزی برای ستون و دیوار بتنی",
      shortDescription: "قالب فلزی ستون و دیوار",
      unit: "مترمربع",
      unitPrice: "1380000",
    },
    {
      chapterNo: 9,
      code: "090201",
      fullDescription:
        "تهیه، بریدن، خم کردن و کار گذاشتن میلگرد آجدار به قطر تا ۱۸ میلی‌متر",
      shortDescription: "آرماتوربندی میلگرد آجدار تا ۱۸",
      unit: "کیلوگرم",
      unitPrice: "62500",
    },
    {
      chapterNo: 9,
      code: "090203",
      fullDescription:
        "تهیه، بریدن، خم کردن و کار گذاشتن میلگرد آجدار به قطر بیش از ۱۸ میلی‌متر",
      shortDescription: "آرماتوربندی میلگرد آجدار بالای ۱۸",
      unit: "کیلوگرم",
      unitPrice: "59800",
    },
    {
      chapterNo: 10,
      code: "100301",
      fullDescription:
        "تهیه و اجرای بتن با مقاومت مشخصه ۲۵ مگاپاسکال در پی و شالوده",
      shortDescription: "بتن C25 پی و شالوده",
      unit: "مترمکعب",
      unitPrice: "5850000",
    },
    {
      chapterNo: 10,
      code: "100401",
      fullDescription:
        "تهیه و اجرای بتن با مقاومت مشخصه ۳۰ مگاپاسکال در ستون، تیر و سقف",
      shortDescription: "بتن C30 ستون و سقف",
      unit: "مترمکعب",
      unitPrice: "6420000",
    },
    {
      chapterNo: 11,
      code: "110105",
      fullDescription: "تهیه و نصب بلوک سقفی سفالی به ضخامت ۲۰ سانتی‌متر",
      shortDescription: "بلوک سفالی سقفی ۲۰ سانتی",
      unit: "مترمربع",
      unitPrice: "780000",
    },
  ];

  const itemRows = await db
    .insert(priceItems)
    .values(
      itemDefs.map((i) => ({
        priceBookId: book.id,
        chapterId: chapterId(i.chapterNo),
        code: i.code,
        fullDescription: i.fullDescription,
        shortDescription: i.shortDescription,
        unit: i.unit,
        unitPrice: i.unitPrice,
      })),
    )
    .returning();
  const itemByCode = new Map(itemRows.map((i) => [i.code, i]));

  /* ---------------- منابع و آنالیز بها ---------------- */
  const resourceRows = await db
    .insert(resources)
    .values([
      {
        code: "R-CEM",
        title: "سیمان پرتلند تیپ ۲",
        unit: "کیلوگرم",
        tonPerUnit: "0.001",
        freeHaulKm: "30",
      },
      {
        code: "R-REB",
        title: "میلگرد آجدار",
        unit: "کیلوگرم",
        tonPerUnit: "0.001",
        freeHaulKm: "30",
      },
      {
        code: "R-AGG",
        title: "شن و ماسه شسته",
        unit: "تن",
        tonPerUnit: "1",
        freeHaulKm: "30",
      },
    ])
    .returning();
  const res = (code: string) => resourceRows.find((r) => r.code === code)!;

  await db.insert(itemAnalysis).values([
    // بتن C25: ۳۵۰ کیلو سیمان و ۱.۹ تن سنگدانه در هر مترمکعب
    {
      priceItemId: itemByCode.get("100301")!.id,
      resourceId: res("R-CEM").id,
      consumptionPerUnit: "350",
    },
    {
      priceItemId: itemByCode.get("100301")!.id,
      resourceId: res("R-AGG").id,
      consumptionPerUnit: "1.9",
    },
    // بتن C30: ۴۰۰ کیلو سیمان
    {
      priceItemId: itemByCode.get("100401")!.id,
      resourceId: res("R-CEM").id,
      consumptionPerUnit: "400",
    },
    {
      priceItemId: itemByCode.get("100401")!.id,
      resourceId: res("R-AGG").id,
      consumptionPerUnit: "1.85",
    },
    // آرماتوربندی: ۱.۰۵ کیلو میلگرد در هر کیلوگرم کار (احتساب پرت)
    {
      priceItemId: itemByCode.get("090201")!.id,
      resourceId: res("R-REB").id,
      consumptionPerUnit: "1.05",
    },
    {
      priceItemId: itemByCode.get("090203")!.id,
      resourceId: res("R-REB").id,
      consumptionPerUnit: "1.04",
    },
  ]);

  /* ---------------- پله‌های بخشنامه حمل ---------------- */
  await db.insert(haulTiers).values([
    { fromKm: "0", toKm: "10", ratePerTonKm: "48000", title: "پله ۱: تا ۱۰ کیلومتر" },
    { fromKm: "10", toKm: "30", ratePerTonKm: "39500", title: "پله ۲: ۱۰ تا ۳۰ کیلومتر" },
    { fromKm: "30", toKm: "100", ratePerTonKm: "31000", title: "پله ۳: ۳۰ تا ۱۰۰ کیلومتر" },
    { fromKm: "100", toKm: null, ratePerTonKm: "26500", title: "پله ۴: مازاد بر ۱۰۰ کیلومتر" },
  ]);

  /* ---------------- ضرایب منطقه‌ای ---------------- */
  await db.insert(regionalFactors).values([
    { provinceCode: "THR", provinceName: "تهران", factor: "1.00" },
    { provinceCode: "ISF", provinceName: "اصفهان", factor: "1.05" },
    { provinceCode: "SBL", provinceName: "سیستان و بلوچستان", factor: "1.23" },
    { provinceCode: "KHR", provinceName: "خراسان رضوی", factor: "1.08" },
  ]);

  /* ---------------- شاخص‌های تعدیل سه‌ماهه ---------------- */
  const indexSeries: Array<{ year: number; quarter: number; value: number }> = [];
  let base = 3200;
  for (let y = 1402; y <= 1404; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      base = Math.round(base * 1.075);
      indexSeries.push({ year: y, quarter: q, value: base });
    }
  }
  const indexValues: Array<typeof adjustmentIndices.$inferInsert> = [];
  for (const s of indexSeries) {
    indexValues.push({
      priceBookId: book.id,
      chapterNo: null,
      year: s.year,
      quarter: s.quarter,
      indexValue: String(s.value),
    });
    for (const c of chapterDefs) {
      // شاخص فصول با انحراف کوچک نسبت به شاخص کلی
      const drift = 1 + (c.chapterNo % 5) * 0.012;
      indexValues.push({
        priceBookId: book.id,
        chapterNo: c.chapterNo,
        year: s.year,
        quarter: s.quarter,
        indexValue: String(Math.round(s.value * drift)),
      });
    }
  }
  await db.insert(adjustmentIndices).values(indexValues);

  /* ---------------- درخت پروژه ---------------- */
  const [rootProject] = await db
    .insert(projects)
    .values({
      parentId: null,
      nodeType: "parent",
      code: "P-1000",
      title: "پروژه مادر: مجتمع مسکونی و خدماتی مهر",
      employer: "شرکت عمران شهر جدید",
      contractor: "شرکت ساختمانی پایدار بنا",
      consultant: "مهندسان مشاور طرح و ساخت",
      sortOrder: 1,
    })
    .returning();

  const subProjects = await db
    .insert(projects)
    .values([
      {
        parentId: rootProject.id,
        nodeType: "project",
        code: "P-1001",
        title: "زیرپروژه ۱: بلوک‌های مسکونی A تا D",
        employer: "شرکت عمران شهر جدید",
        contractor: "شرکت ساختمانی پایدار بنا",
        sortOrder: 1,
      },
      {
        parentId: rootProject.id,
        nodeType: "project",
        code: "P-1002",
        title: "زیرپروژه ۲: ساختمان خدمات مرکزی",
        employer: "شرکت عمران شهر جدید",
        contractor: "شرکت آبادگران شرق",
        sortOrder: 2,
      },
    ])
    .returning();

  const contractRows = await db
    .insert(contracts)
    .values([
      {
        projectId: subProjects[0].id,
        contractNo: "97/1403-A",
        title: "پیمان اجرای اسکلت بتنی بلوک‌های مسکونی",
        priceBookId: book.id,
        startDate: "1403/02/15",
        allowedEndDate: "1404/08/30",
        initialAmount: "180000000000",
        adjustmentFactorD: "0.95",
        baseIndexYear: 1402,
        baseIndexQuarter: 4,
        siteSetupMethod: "p35_35_30",
        siteSetupApprovedAmount: "9000000000",
      },
      {
        projectId: subProjects[1].id,
        contractNo: "98/1403-B",
        title: "پیمان اجرای ساختمان خدمات مرکزی",
        priceBookId: book.id,
        startDate: "1403/04/01",
        allowedEndDate: "1404/12/29",
        initialAmount: "72000000000",
        adjustmentFactorD: "0.95",
        baseIndexYear: 1403,
        baseIndexQuarter: 1,
        siteSetupMethod: "percentage",
        siteSetupApprovedAmount: "0",
        siteSetupPercent: "0.025",
      },
    ])
    .returning();

  /* ---------------- ضرایب پیمان ---------------- */
  await db.insert(contractCoefficients).values([
    {
      contractId: contractRows[0].id,
      kind: "overhead",
      title: "ضریب بالاسری",
      value: "1.41000000000000",
      scope: "all",
      sortOrder: 1,
    },
    {
      contractId: contractRows[0].id,
      kind: "proposal",
      title: "ضریب پیشنهادی پیمانکار",
      value: "0.96350000000000",
      scope: "all",
      sortOrder: 2,
    },
    {
      contractId: contractRows[0].id,
      kind: "regional",
      title: "ضریب منطقه‌ای (خراسان رضوی)",
      value: "1.08000000000000",
      scope: "all",
      sortOrder: 3,
    },
    {
      contractId: contractRows[0].id,
      kind: "height",
      title: "ضریب ارتفاع",
      value: "1.02500000000000",
      scope: "all",
      sortOrder: 4,
    },
    {
      contractId: contractRows[0].id,
      kind: "difficulty",
      title: "ضریب صعوبت فصل بتن درجا",
      value: "1.03000000000000",
      scope: "chapter",
      chapterNo: 10,
      sortOrder: 5,
    },
    {
      contractId: contractRows[1].id,
      kind: "overhead",
      title: "ضریب بالاسری (پیمان بدون تعدیل بالاسری)",
      value: "1.30000000000000",
      scope: "all",
      sortOrder: 1,
    },
    {
      contractId: contractRows[1].id,
      kind: "proposal",
      title: "ضریب پیشنهادی پیمانکار",
      value: "1.04200000000000",
      scope: "all",
      sortOrder: 2,
    },
  ]);

  /* ---------------- موقعیت‌ها ---------------- */
  const locationRows = await db
    .insert(locations)
    .values([
      { contractId: contractRows[0].id, title: "فونداسیون", positionFactor: "1" },
      { contractId: contractRows[0].id, title: "ستون‌های طبقه همکف", positionFactor: "1" },
      { contractId: contractRows[0].id, title: "سقف طبقه اول", positionFactor: "1.05" },
      { contractId: contractRows[1].id, title: "فونداسیون خدمات", positionFactor: "1" },
    ])
    .returning();

  /* ---------------- صورت وضعیت‌ها ---------------- */
  const statementRows = await db
    .insert(statements)
    .values([
      {
        contractId: contractRows[0].id,
        periodNo: 1,
        version: "contractor",
        title: "صورت وضعیت موقت شماره ۱",
        fromDate: "1403/02/15",
        toDate: "1403/06/31",
        previousGrossAmount: "0",
        status: "approved",
      },
      {
        contractId: contractRows[0].id,
        periodNo: 2,
        version: "contractor",
        title: "صورت وضعیت موقت شماره ۲ (تجمعی)",
        fromDate: "1403/07/01",
        toDate: "1403/12/29",
        previousGrossAmount: "0",
        status: "draft",
      },
      {
        contractId: contractRows[1].id,
        periodNo: 1,
        version: "contractor",
        title: "صورت وضعیت موقت شماره ۱",
        fromDate: "1403/04/01",
        toDate: "1403/09/30",
        previousGrossAmount: "0",
        status: "draft",
      },
    ])
    .returning();

  /* ---------------- ریزمتره ---------------- */
  const detailValues: Array<typeof detailQuantities.$inferInsert> = [
    // صورت وضعیت ۱
    {
      statementId: statementRows[0].id,
      priceItemId: itemByCode.get("030101")!.id,
      locationId: locationRows[0].id,
      description: "گودبرداری محل پی بلوک A",
      countQty: "1",
      length: "42.5",
      width: "28.4",
      height: "2.6",
    },
    {
      statementId: statementRows[0].id,
      priceItemId: itemByCode.get("030101")!.id,
      locationId: locationRows[0].id,
      description: "کسر حجم رمپ دسترسی",
      countQty: "1",
      length: "12",
      width: "6",
      height: "1.3",
      sign: -1,
    },
    {
      statementId: statementRows[0].id,
      priceItemId: itemByCode.get("080101")!.id,
      locationId: locationRows[0].id,
      description: "قالب‌بندی جانبی پی گسترده",
      countQty: "2",
      length: "142",
      height: "0.9",
    },
    {
      statementId: statementRows[0].id,
      priceItemId: itemByCode.get("100301")!.id,
      locationId: locationRows[0].id,
      description: "بتن‌ریزی پی گسترده",
      countQty: "1",
      length: "42.5",
      width: "28.4",
      height: "0.9",
    },
    {
      statementId: statementRows[0].id,
      priceItemId: itemByCode.get("090201")!.id,
      locationId: locationRows[0].id,
      description: "آرماتور شبکه فوقانی و تحتانی پی",
      countQty: "1",
      weight: "96500",
    },
    // صورت وضعیت ۲
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("030101")!.id,
      locationId: locationRows[0].id,
      description: "گودبرداری تجمعی (شامل دوره قبل)",
      countQty: "1",
      length: "42.5",
      width: "28.4",
      height: "2.6",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("100301")!.id,
      locationId: locationRows[0].id,
      description: "بتن پی گسترده (تجمعی)",
      countQty: "1",
      length: "42.5",
      width: "28.4",
      height: "0.9",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("030101")!.id,
      locationId: locationRows[0].id,
      description: "کسر حجم رمپ دسترسی (تجمعی)",
      countQty: "1",
      length: "12",
      width: "6",
      height: "1.3",
      sign: -1,
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("080101")!.id,
      locationId: locationRows[0].id,
      description: "قالب‌بندی جانبی پی گسترده (تجمعی)",
      countQty: "2",
      length: "142",
      height: "0.9",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("090201")!.id,
      locationId: locationRows[0].id,
      description: "آرماتور پی و ریشه ستون‌ها (تجمعی)",
      countQty: "1",
      weight: "118400",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("080301")!.id,
      locationId: locationRows[1].id,
      description: "قالب ستون‌های همکف",
      countQty: "48",
      length: "2.4",
      width: "1.6",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("100401")!.id,
      locationId: locationRows[1].id,
      description: "بتن ستون‌های همکف",
      countQty: "48",
      length: "0.5",
      width: "0.5",
      height: "3.2",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("100401")!.id,
      locationId: locationRows[2].id,
      description: "بتن تیر و سقف طبقه اول",
      countQty: "1",
      length: "42",
      width: "28",
      height: "0.12",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("090203")!.id,
      locationId: locationRows[2].id,
      description: "آرماتور تیرها و سقف",
      countQty: "1",
      weight: "74200",
    },
    {
      statementId: statementRows[1].id,
      priceItemId: itemByCode.get("110105")!.id,
      locationId: locationRows[2].id,
      description: "بلوک سفالی سقف تیرچه بلوک",
      countQty: "1",
      length: "42",
      width: "28",
    },
    // صورت وضعیت پیمان دوم
    {
      statementId: statementRows[2].id,
      priceItemId: itemByCode.get("030101")!.id,
      locationId: locationRows[3].id,
      description: "خاک‌برداری ساختمان خدمات",
      countQty: "1",
      length: "26",
      width: "18",
      height: "2.2",
    },
    {
      statementId: statementRows[2].id,
      priceItemId: itemByCode.get("100301")!.id,
      locationId: locationRows[3].id,
      description: "بتن پی ساختمان خدمات",
      countQty: "1",
      length: "26",
      width: "18",
      height: "0.8",
    },
  ];
  await db.insert(detailQuantities).values(detailValues);

  /* ---------------- آیتم‌های ستاره‌دار / فاکتوری / پای‌کار ---------------- */
  const customRows = await db
    .insert(customItems)
    .values([
      {
        statementId: statementRows[1].id,
        itemType: "star",
        chapterNo: 10,
        code: "S-1001",
        description: "ردیف ستاره‌دار: افزودنی ژل میکروسیلیس بتن سقف",
        unit: "مترمکعب",
        unitPrice: "480000",
        applyCoefficients: true,
        applyAdjustment: false,
      },
      {
        statementId: statementRows[1].id,
        itemType: "invoice",
        chapterNo: 11,
        code: "F-2001",
        description: "ردیف فاکتوری: خرید و نصب درب ضد حریق",
        unit: "عدد",
        unitPrice: "38500000",
        applyCoefficients: false,
        applyAdjustment: false,
      },
      {
        statementId: statementRows[1].id,
        itemType: "onsite",
        chapterNo: 9,
        code: "M-3001",
        description: "مصالح پای‌کار: میلگرد دپو شده در کارگاه (۷۰٪ بها)",
        unit: "کیلوگرم",
        unitPrice: "43750",
        applyCoefficients: false,
        applyAdjustment: false,
      },
      {
        statementId: statementRows[1].id,
        itemType: "adjust",
        chapterNo: 10,
        code: "A-100401",
        description: "اضافه بها بتن‌ریزی در ارتفاع بیش از ۱۰ متر (۱۵٪ ردیف مرتبط)",
        unit: "مقطوع",
        unitPrice: "0",
        relatedItemCode: "100401",
        percent: "0.15",
        applyCoefficients: true,
        applyAdjustment: true,
      },
    ])
    .returning();

  await db.insert(detailQuantities).values([
    {
      statementId: statementRows[1].id,
      customItemId: customRows[0].id,
      locationId: locationRows[2].id,
      description: "افزودنی برای بتن سقف",
      countQty: "1",
      length: "141",
    },
    {
      statementId: statementRows[1].id,
      customItemId: customRows[1].id,
      locationId: locationRows[1].id,
      description: "درب ضد حریق راه‌پله",
      countQty: "4",
    },
    {
      statementId: statementRows[1].id,
      customItemId: customRows[2].id,
      locationId: locationRows[1].id,
      description: "میلگرد دپو شده",
      countQty: "1",
      weight: "18500",
    },
    {
      statementId: statementRows[1].id,
      customItemId: customRows[3].id,
      locationId: locationRows[2].id,
      description: "اضافه بها ارتفاع",
      countQty: "1",
    },
  ]);

  /* ---------------- مسیرهای حمل ---------------- */
  await db.insert(haulRoutes).values([
    {
      contractId: contractRows[0].id,
      resourceId: res("R-CEM").id,
      origin: "کارخانه سیمان مشهد",
      destination: "کارگاه بلوک‌های مسکونی",
      pavedKm: "86",
      unpavedKm: "4.5",
      unpavedEquivalentFactor: "2",
    },
    {
      contractId: contractRows[0].id,
      resourceId: res("R-REB").id,
      origin: "انبار میلگرد نیشابور",
      destination: "کارگاه بلوک‌های مسکونی",
      pavedKm: "128",
      unpavedKm: "2",
      unpavedEquivalentFactor: "2",
    },
    {
      contractId: contractRows[0].id,
      resourceId: res("R-AGG").id,
      origin: "معدن شن و ماسه",
      destination: "کارگاه بلوک‌های مسکونی",
      pavedKm: "38",
      unpavedKm: "6",
      unpavedEquivalentFactor: "2",
    },
    {
      contractId: contractRows[1].id,
      resourceId: res("R-CEM").id,
      origin: "کارخانه سیمان مشهد",
      destination: "کارگاه خدمات مرکزی",
      pavedKm: "64",
      unpavedKm: "0",
      unpavedEquivalentFactor: "2",
    },
  ]);

  return { statementId: statementRows[1].id, rootProjectId: rootProject.id };
}
