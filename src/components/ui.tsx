"use client";

import type { ReactNode } from "react";
import { formatMoney, toPersianDigits } from "@/lib/calc/numeric";

export function fa(value: string | number): string {
  return toPersianDigits(String(value));
}

export function Money({
  value,
  decimals = 0,
  className = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const negative = value < 0;
  return (
    <span
      className={`tabular-nums ${negative ? "text-rose-600" : ""} ${className}`}
      dir="ltr"
    >
      {fa(formatMoney(value, decimals))}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "slate",
  hint,
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "sky" | "amber" | "violet";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    sky: "bg-sky-50 border-sky-200 text-sky-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
      <div className="mt-1 text-base font-bold">
        <Money value={value} />
        <span className="mr-1 text-[10px] font-normal opacity-70">ریال</span>
      </div>
      {hint ? <div className="mt-0.5 text-[10px] opacity-70">{hint}</div> : null}
    </div>
  );
}

export function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-right text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            {head.map((h) => (
              <th
                key={h}
                className="border border-slate-200 px-2 py-2 font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
  dir,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
  dir?: "ltr" | "rtl";
}) {
  return (
    <td
      colSpan={colSpan}
      dir={dir}
      className={`border border-slate-200 px-2 py-1.5 align-middle ${className}`}
    >
      {children}
    </td>
  );
}
