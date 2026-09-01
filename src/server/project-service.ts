import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contracts, projects, statements } from "@/db/schema";
import { CalculationError, rial } from "@/lib/calc/numeric";
import { computeStatement } from "./statement-service";

export interface TreeNode {
  id: number;
  parentId: number | null;
  nodeType: string;
  code: string;
  title: string;
  employer: string | null;
  contractor: string | null;
  children: TreeNode[];
  contracts: Array<{
    id: number;
    contractNo: string;
    title: string;
    startDate: string;
    allowedEndDate: string;
    statements: Array<{
      id: number;
      periodNo: number;
      version: string;
      title: string;
      fromDate: string;
      toDate: string;
      status: string;
    }>;
  }>;
}

export async function getProjectTree(): Promise<TreeNode[]> {
  const [allProjects, allContracts, allStatements] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.sortOrder), asc(projects.id)),
    db.select().from(contracts).orderBy(asc(contracts.id)),
    db
      .select()
      .from(statements)
      .orderBy(asc(statements.periodNo), asc(statements.id)),
  ]);

  const nodes = new Map<number, TreeNode>();
  for (const p of allProjects) {
    nodes.set(p.id, {
      id: p.id,
      parentId: p.parentId,
      nodeType: p.nodeType,
      code: p.code,
      title: p.title,
      employer: p.employer,
      contractor: p.contractor,
      children: [],
      contracts: [],
    });
  }
  for (const c of allContracts) {
    const node = nodes.get(c.projectId);
    if (!node) continue;
    node.contracts.push({
      id: c.id,
      contractNo: c.contractNo,
      title: c.title,
      startDate: c.startDate,
      allowedEndDate: c.allowedEndDate,
      statements: allStatements
        .filter((s) => s.contractId === c.id)
        .map((s) => ({
          id: s.id,
          periodNo: s.periodNo,
          version: s.version,
          title: s.title,
          fromDate: s.fromDate,
          toDate: s.toDate,
          status: s.status,
        })),
    });
  }
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** درگ اند دراپ: انتقال یک زیرپروژه به پروژه مادر دیگر */
export async function moveProject(
  projectId: number,
  newParentId: number | null,
): Promise<void> {
  if (projectId === newParentId) {
    throw new CalculationError("یک پروژه نمی‌تواند والد خودش باشد");
  }
  if (newParentId !== null) {
    // جلوگیری از ایجاد حلقه در درخت
    const all = await db.select().from(projects);
    const byId = new Map(all.map((p) => [p.id, p]));
    let cursor: number | null = newParentId;
    let guard = 0;
    while (cursor !== null && guard < 100) {
      if (cursor === projectId) {
        throw new CalculationError(
          "انتقال نامعتبر است: پروژه مقصد از زیرمجموعه‌های همین پروژه است",
        );
      }
      cursor = byId.get(cursor)?.parentId ?? null;
      guard += 1;
    }
  }
  await db
    .update(projects)
    .set({ parentId: newParentId })
    .where(eq(projects.id, projectId));
}

export interface AggregationRow {
  projectId: number;
  projectTitle: string;
  contractId: number;
  contractTitle: string;
  statementId: number;
  statementTitle: string;
  coefficient: number;
  net: number;
  gross: number;
  haulage: number;
  siteSetup: number;
  adjustment: number;
  grandTotal: number;
}

export interface AggregationResult {
  root: { id: number; title: string; code: string };
  rows: AggregationRow[];
  totals: {
    net: number;
    gross: number;
    haulage: number;
    siteSetup: number;
    adjustment: number;
    grandTotal: number;
  };
}

/** تجمیع برگه مالی زیرپروژه‌ها در پروژه مادر با حفظ ضرایب اختصاصی هر زیرپروژه */
export async function aggregateProject(
  rootId: number,
): Promise<AggregationResult> {
  const all = await db.select().from(projects);
  const root = all.find((p) => p.id === rootId);
  if (!root) throw new CalculationError("پروژه مادر یافت نشد");

  const descendants: number[] = [];
  const collect = (id: number) => {
    descendants.push(id);
    for (const child of all.filter((p) => p.parentId === id)) collect(child.id);
  };
  collect(rootId);

  const contractRows = await db
    .select()
    .from(contracts)
    .where(inArray(contracts.projectId, descendants));
  const rows: AggregationRow[] = [];

  for (const contract of contractRows) {
    const stmts = await db
      .select()
      .from(statements)
      .where(eq(statements.contractId, contract.id))
      .orderBy(asc(statements.periodNo));
    const last = stmts.filter((s) => s.version === "contractor").pop() ?? stmts.pop();
    if (!last) continue;
    const computed = await computeStatement(last.id);
    const project = all.find((p) => p.id === contract.projectId);
    rows.push({
      projectId: contract.projectId,
      projectTitle: project?.title ?? "-",
      contractId: contract.id,
      contractTitle: contract.title,
      statementId: last.id,
      statementTitle: last.title,
      coefficient: computed.coefficients.globalFactor,
      net: computed.totals.net,
      gross: computed.totals.gross,
      haulage: computed.totals.haulage,
      siteSetup: computed.totals.siteSetup,
      adjustment: computed.totals.adjustment,
      grandTotal: computed.totals.grandTotal,
    });
  }

  const totalOf = (key: keyof AggregationRow) =>
    rial(rows.reduce((a, r) => a + (r[key] as number), 0));

  return {
    root: { id: root.id, title: root.title, code: root.code },
    rows,
    totals: {
      net: totalOf("net"),
      gross: totalOf("gross"),
      haulage: totalOf("haulage"),
      siteSetup: totalOf("siteSetup"),
      adjustment: totalOf("adjustment"),
      grandTotal: totalOf("grandTotal"),
    },
  };
}
