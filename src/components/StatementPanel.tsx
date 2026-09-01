"use client";

import { useCallback, useEffect, useState } from "react";
import type { StatementComputation } from "@/server/statement-service";
import { Card, Money, Stat, Table, Td, fa } from "./ui";

type Options = {
  priceItems: Array<{ id: number; code: string; shortDescription: string; unit: string; unitPrice: string }>;
  locations: Array<{ id: number; title: string; positionFactor: string }>;
  customItems: Array<{ id: number; code: string; description: string; unit: string }>;
};

const TABS = [
  "ریزمتره",
  "خلاصه متره",
  "برگه مالی",
  "ضرایب پیمان",
  "حمل مصالح",
  "فصول و تجهیز",
  "تعدیل",
  "کسورات",
] as const;

type Tab = (typeof TABS)[number];

export default function StatementPanel({
  data,
  onRefresh,
}: {
  data: StatementComputation;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<Tab>("برگه مالی");
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const statementId = data.statement.id;
  const contractId = data.contract.id;

  const loadOptions = useCallback(async () => {
    const res = await fetch(`/api/statements/${statementId}/rows`);
    const json = await res.json();
    if (res.ok) setOptions(json as Options);
  }, [statementId]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const post = async (url: string, body: unknown, method = "POST") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "خطای نامشخص");
      onRefresh();
      await loadOptions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="جمع خالص کارکرد" value={data.totals.net} />
        <Stat label="جمع ناخالص (با ضرایب)" value={data.totals.gross} tone="sky" />
        <Stat label="مابه‌التفاوت حمل" value={data.totals.haulage} tone="amber" />
        <Stat label="تجهیز و برچیدن کارگاه" value={data.totals.siteSetup} tone="violet" />
        <Stat label="تعدیل دوره" value={data.totals.adjustment} tone="emerald" />
        <Stat label="جمع کل صورت وضعیت" value={data.totals.grandTotal} tone="emerald" />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === t
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {tab === "ریزمتره" ? (
        <Card
          title="ریزمتره (Detailed Take-off)"
          subtitle="جمع کل = علامت × تعداد × طول × عرض × ارتفاع/وزن"
        >
          <DetailRowForm
            options={options}
            busy={busy}
            onSubmit={(payload) => post(`/api/statements/${statementId}/rows`, payload)}
          />
          <div className="mt-4">
            <Table
              head={[
                "کد",
                "شرح ردیف",
                "موقعیت",
                "شرح ریزمتره",
                "تعداد",
                "طول",
                "عرض",
                "ارتفاع",
                "وزن",
                "واحد",
                "جمع کل",
                "",
              ]}
            >
              {data.detailRows.map((r) => (
                <tr key={r.id} className={r.sign === -1 ? "bg-rose-50" : ""}>
                  <Td>{fa(r.code)}</Td>
                  <Td className="min-w-[160px]">{r.itemTitle}</Td>
                  <Td>{r.locationTitle}</Td>
                  <Td className="min-w-[150px]">{r.description}</Td>
                  <Td>{fa(r.countQty)}</Td>
                  <Td>{r.length ? fa(r.length) : "-"}</Td>
                  <Td>{r.width ? fa(r.width) : "-"}</Td>
                  <Td>{r.height ? fa(r.height) : "-"}</Td>
                  <Td>{r.weight ? fa(r.weight) : "-"}</Td>
                  <Td>{r.unit}</Td>
                  <Td className="font-bold">
                    <Money value={r.total} decimals={3} />
                  </Td>
                  <Td>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-[11px] text-rose-600 hover:underline"
                      onClick={() =>
                        post(
                          `/api/statements/${statementId}/rows?rowId=${r.id}`,
                          undefined,
                          "DELETE",
                        )
                      }
                    >
                      حذف
                    </button>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      ) : null}

      {tab === "خلاصه متره" ? (
        <Card
          title="خلاصه متره (Summary of Quantities)"
          subtitle="تجمیع ردیف‌های یکسان از موقعیت‌های مختلف با اعمال ضریب موقعیت"
        >
          <Table
            head={["کد", "شرح", "واحد", "موقعیت‌ها", "مقدار خام", "مقدار با ضریب موقعیت"]}
          >
            {data.summary.map((s) => (
              <tr key={s.itemKey}>
                <Td>{fa(s.code)}</Td>
                <Td className="min-w-[200px]">{s.description}</Td>
                <Td>{s.unit}</Td>
                <Td className="min-w-[220px]">
                  {s.breakdown.map((b) => (
                    <div key={`${s.itemKey}-${b.locationId}`} className="text-[11px]">
                      {b.locationTitle} : <Money value={b.rawQuantity} decimals={3} />{" "}
                      × {fa(b.positionFactor)} ={" "}
                      <Money value={b.quantity} decimals={3} />
                    </div>
                  ))}
                </Td>
                <Td>
                  <Money value={s.rawQuantity} decimals={3} />
                </Td>
                <Td className="font-bold">
                  <Money value={s.quantity} decimals={3} />
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {tab === "برگه مالی" ? (
        <Card
          title="برگه مالی (Financial Sheet)"
          subtitle="مبلغ ردیف = مقدار × قیمت واحد ، مبلغ ناخالص = مبلغ خالص × ضریب ترکیبی"
        >
          <Table
            head={[
              "فصل",
              "کد",
              "شرح",
              "نوع",
              "واحد",
              "مقدار",
              "بهای واحد (ریال)",
              "مبلغ خالص",
              "ضریب",
              "مبلغ ناخالص",
            ]}
          >
            {data.financialRows.map((r) => (
              <tr key={r.itemKey}>
                <Td>{fa(r.chapterNo)}</Td>
                <Td>{fa(r.code)}</Td>
                <Td className="min-w-[220px]">{r.description}</Td>
                <Td>
                  <TypeBadge type={r.itemType} />
                </Td>
                <Td>{r.unit}</Td>
                <Td>
                  <Money value={r.quantity} decimals={3} />
                </Td>
                <Td>
                  <Money value={r.unitPrice} />
                </Td>
                <Td>
                  <Money value={r.netAmount} />
                </Td>
                <Td dir="ltr">{fa(r.coefficient)}</Td>
                <Td className="font-bold">
                  <Money value={r.grossAmount} />
                </Td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-bold">
              <Td colSpan={7}>جمع کل</Td>
              <Td>
                <Money value={data.totals.net} />
              </Td>
              <Td />
              <Td>
                <Money value={data.totals.gross} />
              </Td>
            </tr>
          </Table>
        </Card>
      ) : null}

      {tab === "ضرایب پیمان" ? (
        <CoefficientsTab
          data={data}
          busy={busy}
          onAdd={(payload) => post(`/api/contracts/${contractId}/coefficients`, payload)}
          onToggle={(id, isActive) =>
            post(
              `/api/contracts/${contractId}/coefficients`,
              { coefficientId: id, isActive },
              "PATCH",
            )
          }
          onDelete={(id) =>
            post(
              `/api/contracts/${contractId}/coefficients?coefficientId=${id}`,
              undefined,
              "DELETE",
            )
          }
        />
      ) : null}

      {tab === "حمل مصالح" ? (
        <div className="space-y-4">
          <Card
            title="وزن مصالح مصرفی بر اساس آنالیز بها"
            subtitle="مقدار مصرف = مقدار ردیف × ضریب مصرف آنالیز"
          >
            <Table head={["کد منبع", "منبع", "واحد", "مقدار مصرف", "تناژ (تن)"]}>
              {data.haulage.consumptions.map((c) => (
                <tr key={c.resourceId}>
                  <Td>{c.code}</Td>
                  <Td>{c.title}</Td>
                  <Td>{c.unit}</Td>
                  <Td>
                    <Money value={c.quantity} decimals={2} />
                  </Td>
                  <Td className="font-bold">
                    <Money value={c.tonnage} decimals={3} />
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card
            title="مابه‌التفاوت حمل (تن-کیلومتر با پله‌های بخشنامه)"
            subtitle="مسافت معادل = آسفالته + شوسه × ضریب ؛ مسافت مشمول = معادل − مسافت مشمول قیمت پایه"
          >
            <Table
              head={[
                "منبع",
                "مبدأ",
                "مقصد",
                "تناژ",
                "مسافت معادل (کیلومتر)",
                "مسافت رایگان",
                "مسافت مشمول",
                "تن-کیلومتر",
                "پله‌های محاسبه",
                "مبلغ (ریال)",
              ]}
            >
              {data.haulage.lines.map((l) => (
                <tr key={l.resourceId}>
                  <Td>{l.title}</Td>
                  <Td>{l.origin}</Td>
                  <Td>{l.destination}</Td>
                  <Td>
                    <Money value={l.tonnage} decimals={3} />
                  </Td>
                  <Td>{fa(l.equivalentKm)}</Td>
                  <Td>{fa(l.freeHaulKm)}</Td>
                  <Td>{fa(l.chargeableKm)}</Td>
                  <Td>
                    <Money value={l.tonKm} decimals={2} />
                  </Td>
                  <Td className="min-w-[240px]">
                    {l.tiers.map((t) => (
                      <div key={t.title} className="text-[11px]">
                        {t.title}: {fa(t.segmentKm)} کیلومتر ×{" "}
                        <Money value={t.ratePerTonKm} /> ={" "}
                        <Money value={t.amount} />
                      </div>
                    ))}
                  </Td>
                  <Td className="font-bold">
                    <Money value={l.amount} />
                  </Td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold">
                <Td colSpan={9}>جمع مابه‌التفاوت حمل</Td>
                <Td>
                  <Money value={data.haulage.totalAmount} />
                </Td>
              </tr>
            </Table>
          </Card>
        </div>
      ) : null}

      {tab === "فصول و تجهیز" ? (
        <div className="space-y-4">
          <Card title="مبالغ فصول" subtitle="مبلغ خالص و ناخالص هر فصل با ضریب ترکیبی">
            <Table
              head={[
                "فصل",
                "عنوان",
                "تعداد ردیف",
                "مبلغ خالص",
                "ضریب ترکیبی",
                "مبلغ ناخالص",
                "مبنای تعدیل",
              ]}
            >
              {data.chapterTotals.map((c) => (
                <tr key={c.chapterNo}>
                  <Td>{fa(c.chapterNo)}</Td>
                  <Td className="min-w-[220px]">{c.title}</Td>
                  <Td>{fa(c.rowCount)}</Td>
                  <Td>
                    <Money value={c.netAmount} />
                  </Td>
                  <Td dir="ltr">{fa(c.coefficient)}</Td>
                  <Td className="font-bold">
                    <Money value={c.grossAmount} />
                  </Td>
                  <Td>
                    <Money value={c.adjustableGrossAmount} />
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card
            title={`تجهیز و برچیدن کارگاه — روش ${data.siteSetup.method}`}
            subtitle="محاسبه بر اساس بخشنامه تجهیز کارگاه"
          >
            <Table head={["شرح", "نسبت اعمال‌شده", "مبلغ (ریال)"]}>
              {data.siteSetup.parts.map((p) => (
                <tr key={p.title}>
                  <Td>{p.title}</Td>
                  <Td dir="ltr">{fa((p.ratio * 100).toFixed(2))}%</Td>
                  <Td className="font-bold">
                    <Money value={p.amount} />
                  </Td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold">
                <Td colSpan={2}>جمع قابل پرداخت</Td>
                <Td>
                  <Money value={data.siteSetup.payable} />
                </Td>
              </tr>
            </Table>
          </Card>
        </div>
      ) : null}

      {tab === "تعدیل" ? <AdjustmentTab data={data} /> : null}

      {tab === "کسورات" ? (
        <Card
          title="کسورات و اضافات"
          subtitle="بیمه، مالیات، ارزش افزوده، بازیافت پیش‌پرداخت و حسن انجام کار"
        >
          <Table head={["شرح", "مبلغ (ریال)"]}>
            <tr>
              <Td>مبلغ ناخالص دوره (کارکرد + حمل + تجهیز + تعدیل)</Td>
              <Td>
                <Money value={data.deductions.base} />
              </Td>
            </tr>
            <tr>
              <Td>مالیات بر ارزش افزوده (اضافه)</Td>
              <Td>
                <Money value={data.deductions.vat} />
              </Td>
            </tr>
            <tr className="bg-slate-50 font-semibold">
              <Td>جمع با احتساب ارزش افزوده</Td>
              <Td>
                <Money value={data.deductions.grossWithVat} />
              </Td>
            </tr>
            <tr>
              <Td>کسر بیمه</Td>
              <Td>
                <Money value={-data.deductions.insurance} />
              </Td>
            </tr>
            <tr>
              <Td>کسر مالیات (علی‌الحساب)</Td>
              <Td>
                <Money value={-data.deductions.tax} />
              </Td>
            </tr>
            <tr>
              <Td>بازیافت پیش‌پرداخت</Td>
              <Td>
                <Money value={-data.deductions.prepaymentRecovery} />
              </Td>
            </tr>
            <tr>
              <Td>سپرده حسن انجام کار</Td>
              <Td>
                <Money value={-data.deductions.performanceBond} />
              </Td>
            </tr>
            <tr className="bg-emerald-50 font-bold">
              <Td>خالص قابل پرداخت</Td>
              <Td>
                <Money value={data.deductions.netPayable} />
              </Td>
            </tr>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    normal: { label: "عادی", cls: "bg-slate-100 text-slate-700" },
    star: { label: "ستاره‌دار", cls: "bg-amber-100 text-amber-800" },
    invoice: { label: "فاکتوری", cls: "bg-violet-100 text-violet-800" },
    onsite: { label: "پای‌کار", cls: "bg-sky-100 text-sky-800" },
    adjust: { label: "اضافه/کسر بها", cls: "bg-emerald-100 text-emerald-800" },
  };
  const conf = map[type] ?? map.normal;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ${conf.cls}`}>
      {conf.label}
    </span>
  );
}

function DetailRowForm({
  options,
  busy,
  onSubmit,
}: {
  options: Options | null;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [itemKey, setItemKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [description, setDescription] = useState("");
  const [values, setValues] = useState({
    countQty: "1",
    length: "",
    width: "",
    height: "",
    weight: "",
  });
  const [sign, setSign] = useState("1");

  if (!options) return <p className="text-xs text-slate-500">در حال بارگذاری…</p>;

  const numeric = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <form
      className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs md:grid-cols-4 xl:grid-cols-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!itemKey) return;
        const [kind, id] = itemKey.split(":");
        onSubmit({
          priceItemId: kind === "P" ? Number(id) : null,
          customItemId: kind === "C" ? Number(id) : null,
          locationId: locationId ? Number(locationId) : null,
          description,
          countQty: Number(values.countQty || 1),
          length: numeric(values.length),
          width: numeric(values.width),
          height: numeric(values.height),
          weight: numeric(values.weight),
          sign: Number(sign),
        });
        setDescription("");
      }}
    >
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-[11px] text-slate-600">ردیف</span>
        <select
          className="rounded border border-slate-300 bg-white p-1.5"
          value={itemKey}
          onChange={(e) => setItemKey(e.target.value)}
          required
        >
          <option value="">انتخاب ردیف…</option>
          <optgroup label="فهرست بها">
            {options.priceItems.map((i) => (
              <option key={i.id} value={`P:${i.id}`}>
                {i.code} — {i.shortDescription}
              </option>
            ))}
          </optgroup>
          <optgroup label="آیتم‌های خارج از فهرست">
            {options.customItems.map((i) => (
              <option key={i.id} value={`C:${i.id}`}>
                {i.code} — {i.description}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate-600">موقعیت</span>
        <select
          className="rounded border border-slate-300 bg-white p-1.5"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">بدون موقعیت</option>
          {options.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} (× {l.positionFactor})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate-600">شرح</span>
        <input
          className="rounded border border-slate-300 p-1.5"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {(["countQty", "length", "width", "height", "weight"] as const).map((key) => (
        <label key={key} className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-600">
            {
              {
                countQty: "تعداد",
                length: "طول",
                width: "عرض",
                height: "ارتفاع",
                weight: "وزن",
              }[key]
            }
          </span>
          <input
            type="number"
            step="any"
            className="rounded border border-slate-300 p-1.5"
            value={values[key]}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
          />
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-slate-600">علامت</span>
        <select
          className="rounded border border-slate-300 bg-white p-1.5"
          value={sign}
          onChange={(e) => setSign(e.target.value)}
        >
          <option value="1">اضافه (+)</option>
          <option value="-1">کسر (−)</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-auto rounded bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-50"
      >
        افزودن سطر ریزمتره
      </button>
    </form>
  );
}

function CoefficientsTab({
  data,
  busy,
  onAdd,
  onToggle,
  onDelete,
}: {
  data: StatementComputation;
  busy: boolean;
  onAdd: (payload: Record<string, unknown>) => void;
  onToggle: (id: number, isActive: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    value: "1",
    scope: "all",
    chapterNo: "",
    kind: "custom",
    includeInAdjustment: true,
  });

  return (
    <Card
      title="ضرایب پیمان"
      subtitle={`ضریب ترکیبی کل دفترچه: ${data.coefficients.globalFactor} — ضریب مؤثر در تعدیل: ${data.coefficients.globalAdjustableFactor}`}
    >
      <form
        className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs md:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            title: form.title,
            value: Number(form.value),
            scope: form.scope,
            chapterNo: form.chapterNo ? Number(form.chapterNo) : null,
            kind: form.kind,
            includeInAdjustment: form.includeInAdjustment,
          });
          setForm({ ...form, title: "", value: "1" });
        }}
      >
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[11px] text-slate-600">عنوان ضریب</span>
          <input
            required
            className="rounded border border-slate-300 p-1.5"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-600">مقدار (تا ۱۴ رقم اعشار)</span>
          <input
            required
            type="number"
            step="any"
            dir="ltr"
            className="rounded border border-slate-300 p-1.5"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-600">نوع</span>
          <select
            className="rounded border border-slate-300 bg-white p-1.5"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            <option value="custom">دلخواه</option>
            <option value="proposal">پیشنهادی</option>
            <option value="regional">منطقه‌ای</option>
            <option value="height">ارتفاع</option>
            <option value="floors">طبقات</option>
            <option value="difficulty">صعوبت</option>
            <option value="overhead">بالاسری</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-600">دامنه</span>
          <select
            className="rounded border border-slate-300 bg-white p-1.5"
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
          >
            <option value="all">کل دفترچه</option>
            <option value="chapter">فصل مشخص</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-600">شماره فصل</span>
          <input
            type="number"
            disabled={form.scope !== "chapter"}
            className="rounded border border-slate-300 p-1.5 disabled:bg-slate-100"
            value={form.chapterNo}
            onChange={(e) => setForm({ ...form, chapterNo: e.target.value })}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="col-span-2 rounded bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-50 md:col-span-1"
        >
          افزودن ضریب
        </button>
      </form>

      <Table
        head={["عنوان", "نوع", "مقدار", "دامنه", "مؤثر در تعدیل", "وضعیت", ""]}
      >
        {data.coefficients.list.map((c) => (
          <tr key={c.id} className={c.isActive ? "" : "opacity-50"}>
            <Td>{c.title}</Td>
            <Td>{c.kind}</Td>
            <Td dir="ltr" className="font-mono">
              {c.value}
            </Td>
            <Td>{c.scope === "all" ? "کل دفترچه" : `فصل ${fa(c.chapterNo ?? "-")}`}</Td>
            <Td>{c.includeInAdjustment ? "بله" : "خیر"}</Td>
            <Td>
              <button
                type="button"
                disabled={busy}
                className="text-[11px] text-sky-700 hover:underline"
                onClick={() => onToggle(c.id, !c.isActive)}
              >
                {c.isActive ? "غیرفعال کردن" : "فعال کردن"}
              </button>
            </Td>
            <Td>
              <button
                type="button"
                disabled={busy}
                className="text-[11px] text-rose-600 hover:underline"
                onClick={() => onDelete(c.id)}
              >
                حذف
              </button>
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function AdjustmentTab({ data }: { data: StatementComputation }) {
  const adj = data.adjustment;
  if (!adj) {
    return (
      <Card title="تعدیل" subtitle="شاخص‌های لازم برای این دوره در دسترس نیست">
        <p className="text-xs text-slate-600">
          برای محاسبه تعدیل، شاخص‌های سه‌ماهه دفترچه و تاریخ‌های پیمان باید تعریف
          شده باشند.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card
        title="انترپوله زمانی کارکرد"
        subtitle={`بازه ${fa(adj.periodStart)} تا ${fa(adj.periodEnd)} — مجموع ${fa(adj.totalDays)} روز — شاخص مبنا: ${fa(adj.baseIndexLabel)} — ضریب d = ${fa(data.contract.adjustmentFactorD)}`}
      >
        <Table
          head={["سه‌ماهه", "از تاریخ", "تا تاریخ", "روز کارکرد", "وزن تسهیم", "شاخص اعمالی"]}
        >
          {adj.allocations.map((a) => (
            <tr key={a.label}>
              <Td>{fa(a.label)}</Td>
              <Td>{fa(a.spanStart)}</Td>
              <Td>{fa(a.spanEnd)}</Td>
              <Td>{fa(a.days)}</Td>
              <Td dir="ltr">{fa((a.weight * 100).toFixed(3))}%</Td>
              <Td>
                {fa(`${a.effectiveYear}-Q${a.effectiveQuarter}`)}
                {a.frozenAfterAllowedEnd ? (
                  <span className="mr-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                    فریز پس از خاتمه مجاز
                  </span>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card
        title="تعدیل فصول"
        subtitle="E = d × (It / I0 − 1) ؛ مبلغ تعدیل = کارکرد دوره فصل × E"
      >
        <Table
          head={[
            "فصل",
            "عنوان",
            "کارکرد دوره (ریال)",
            "جزئیات سه‌ماهه‌ها",
            "ضریب مؤثر E",
            "مبلغ تعدیل",
          ]}
        >
          {adj.chapters.map((c) => (
            <tr key={c.chapterNo}>
              <Td>{fa(c.chapterNo)}</Td>
              <Td className="min-w-[180px]">{c.title}</Td>
              <Td>
                <Money value={c.periodWork} />
              </Td>
              <Td className="min-w-[320px]">
                {c.quarters.map((q) => (
                  <div key={q.label} className="text-[11px]">
                    {fa(q.label)} | روز: {fa(q.days)} | I0={fa(q.baseIndex)} ,
                    It={fa(q.currentIndex)} | E={fa(q.E.toFixed(6))} |{" "}
                    <Money value={q.amount} />
                  </div>
                ))}
              </Td>
              <Td dir="ltr">{fa(c.effectiveE.toFixed(6))}</Td>
              <Td className="font-bold">
                <Money value={c.totalAdjustment} />
              </Td>
            </tr>
          ))}
          <tr className="bg-slate-100 font-bold">
            <Td colSpan={2}>جمع کل</Td>
            <Td>
              <Money value={adj.totalPeriodWork} />
            </Td>
            <Td colSpan={2} />
            <Td>
              <Money value={adj.totalAdjustment} />
            </Td>
          </tr>
        </Table>
      </Card>
    </div>
  );
}
