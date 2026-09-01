"use client";

import { useCallback, useEffect, useState } from "react";
import type { AggregationResult, TreeNode } from "@/server/project-service";
import type { StatementComputation } from "@/server/statement-service";
import ProjectTree from "./ProjectTree";
import StatementPanel from "./StatementPanel";
import { Card, Money, Stat, Table, Td, fa } from "./ui";

export default function Workspace({ initialTree }: { initialTree: TreeNode[] }) {
  const [tree, setTree] = useState<TreeNode[]>(initialTree);
  const [statementId, setStatementId] = useState<number | null>(null);
  const [data, setData] = useState<StatementComputation | null>(null);
  const [aggregate, setAggregate] = useState<AggregationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    const res = await fetch("/api/projects");
    const json = await res.json();
    if (res.ok) setTree(json.tree as TreeNode[]);
  }, []);

  const loadStatement = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/${id}/compute`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در محاسبه");
      setData(json as StatementComputation);
      setStatementId(id);
      setAggregate(null);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAggregate = useCallback(async (projectId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/aggregate`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در تجمیع");
      setAggregate(json as AggregationResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const firstStatement = (() => {
      const stack = [...initialTree];
      while (stack.length) {
        const node = stack.shift()!;
        for (const c of node.contracts) {
          const last = c.statements[c.statements.length - 1];
          if (last) return last.id;
        }
        stack.push(...node.children);
      }
      return null;
    })();
    if (firstStatement) void loadStatement(firstStatement);
  }, [initialTree, loadStatement]);

  const move = async (projectId: number, parentId: number | null) => {
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "انتقال ناموفق بود");
      return;
    }
    await refreshTree();
  };

  const reseed = async () => {
    setLoading(true);
    await fetch("/api/seed", { method: "POST" });
    await refreshTree();
    setData(null);
    setStatementId(null);
    setLoading(false);
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-[1600px] p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-l from-slate-900 to-sky-900 px-5 py-4 text-white shadow">
        <div>
          <h1 className="text-lg font-bold">
            سامانه صورت وضعیت، تعدیل و مابه‌التفاوت حمل
          </h1>
          <p className="mt-1 text-[11px] text-sky-100">
            موتور محاسباتی مبتنی بر منطق نرم‌افزار تکسا — فهرست بهای پایه، ضرایب
            پیمان، انترپوله زمانی تعدیل و تجمیع پروژه مادر
          </p>
        </div>
        <button
          type="button"
          onClick={reseed}
          className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium ring-1 ring-white/30 hover:bg-white/20"
        >
          بازنشانی داده نمونه
        </button>
      </header>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-slate-800">
            ساختار درختی پروژه‌ها
          </h2>
          <ProjectTree
            tree={tree}
            selectedStatementId={statementId}
            onSelectStatement={(id) => loadStatement(id)}
            onSelectProject={(id) => loadAggregate(id)}
            onMove={move}
          />
        </aside>

        <main className="space-y-4">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              در حال محاسبه…
            </div>
          ) : null}

          {aggregate ? (
            <Card
              title={`تجمیع پروژه مادر: ${aggregate.root.title}`}
              subtitle="جمع برگه مالی زیرپروژه‌ها با حفظ ضرایب اختصاصی هر پیمان"
            >
              <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Stat label="خالص" value={aggregate.totals.net} />
                <Stat label="ناخالص" value={aggregate.totals.gross} tone="sky" />
                <Stat label="حمل" value={aggregate.totals.haulage} tone="amber" />
                <Stat label="تجهیز" value={aggregate.totals.siteSetup} tone="violet" />
                <Stat label="تعدیل" value={aggregate.totals.adjustment} tone="emerald" />
                <Stat label="جمع کل" value={aggregate.totals.grandTotal} tone="emerald" />
              </div>
              <Table
                head={[
                  "زیرپروژه",
                  "پیمان",
                  "صورت وضعیت",
                  "ضریب پیمان",
                  "خالص",
                  "ناخالص",
                  "حمل",
                  "تجهیز",
                  "تعدیل",
                  "جمع کل",
                ]}
              >
                {aggregate.rows.map((r) => (
                  <tr key={r.statementId}>
                    <Td>{r.projectTitle}</Td>
                    <Td>{r.contractTitle}</Td>
                    <Td>{r.statementTitle}</Td>
                    <Td dir="ltr">{fa(r.coefficient)}</Td>
                    <Td>
                      <Money value={r.net} />
                    </Td>
                    <Td>
                      <Money value={r.gross} />
                    </Td>
                    <Td>
                      <Money value={r.haulage} />
                    </Td>
                    <Td>
                      <Money value={r.siteSetup} />
                    </Td>
                    <Td>
                      <Money value={r.adjustment} />
                    </Td>
                    <Td className="font-bold">
                      <Money value={r.grandTotal} />
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}

          {data ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
                  <span>
                    <b className="text-slate-800">پیمان:</b> {data.contract.title} (
                    {fa(data.contract.contractNo)})
                  </span>
                  <span>
                    <b className="text-slate-800">صورت وضعیت:</b>{" "}
                    {data.statement.title}
                  </span>
                  <span>
                    <b className="text-slate-800">دوره:</b>{" "}
                    {fa(data.statement.fromDate)} تا {fa(data.statement.toDate)}
                  </span>
                  <span>
                    <b className="text-slate-800">شروع پیمان:</b>{" "}
                    {fa(data.contract.startDate)}
                  </span>
                  <span>
                    <b className="text-slate-800">خاتمه مجاز:</b>{" "}
                    {fa(data.contract.allowedEndDate)}
                  </span>
                </div>
              </div>
              <StatementPanel
                data={data}
                onRefresh={() => statementId && loadStatement(statementId)}
              />
            </>
          ) : null}

          {!data && !aggregate && !loading ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
              یک صورت وضعیت را از درخت پروژه انتخاب کنید یا روی یک پروژه مادر کلیک
              کنید تا گزارش تجمیعی نمایش داده شود.
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
