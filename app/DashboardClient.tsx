"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshButton from "@/components/RefreshButton";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { shiftDate } from "@/lib/officeDay";
import type { DashboardData, DetailLine, ProductionRow, SkuRow } from "@/lib/dashboard";

// While the current office day is shown, the numbers refresh on their own.
const AUTO_REFRESH_MS = 60_000;

const fmt = (n: number) => n.toLocaleString("en-US");
const sum = (rows: { quantity: number }[]) => rows.reduce((t, r) => t + r.quantity, 0);

function matchesProduction(r: ProductionRow, q: string) {
  return (
    (r.workOrderNumber ?? "").toLowerCase().includes(q) ||
    r.sku.toLowerCase().includes(q) ||
    r.name.toLowerCase().includes(q)
  );
}

// A SKU row also matches on its details, so searching an SO number or a
// ZXCKWMS code finds the products under it.
function matchesSku(r: SkuRow, q: string) {
  return (
    r.sku.toLowerCase().includes(q) ||
    r.name.toLowerCase().includes(q) ||
    r.details.some((d) => d.ref.toLowerCase().includes(q) || (d.note ?? "").toLowerCase().includes(q))
  );
}

type DetailsTarget = { row: SkuRow; kind: "shipped" | "other" };

export default function DashboardClient({ initial }: { initial: DashboardData }) {
  const labels = usePageLabels("dashboard_page");

  const [data, setData] = useState<DashboardData>(initial);
  const [date, setDate] = useState(initial.date);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<DetailsTarget | null>(null);
  const requestId = useRef(0);

  const today = data.today;
  const isFuture = date > today;

  // target null = whatever office day is running now (the server decides,
  // so the view follows the shift change at the office hour).
  const load = useCallback(
    async (target: string | null) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const url = target ? `/api/dashboard?date=${encodeURIComponent(target)}` : "/api/dashboard";
        const res = await fetch(url, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? labels.load_failed);
        if (id === requestId.current) {
          setData(body as DashboardData);
          if (!target) setDate((body as DashboardData).date);
        }
      } catch (err) {
        if (id === requestId.current) setError(err instanceof Error ? err.message : labels.load_failed);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [labels.load_failed]
  );

  function goTo(next: string) {
    if (!next) return;
    setDate(next);
    load(next);
  }

  // Keep the running office day fresh while the tab is open. Viewing
  // "today" follows the shift: after the office hour passes it moves on to
  // the new office day by itself.
  useEffect(() => {
    if (!data.isCurrent) return;
    const followToday = data.date === data.today;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(followToday ? null : data.date);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [data.isCurrent, data.date, data.today, load]);

  const q = search.trim().toLowerCase();
  const view = useMemo(
    () => ({
      production: q ? data.production.filter((r) => matchesProduction(r, q)) : data.production,
      otherInbound: q ? data.otherInbound.filter((r) => matchesSku(r, q)) : data.otherInbound,
      shipped: q ? data.shipped.filter((r) => matchesSku(r, q)) : data.shipped,
      otherOutbound: q ? data.otherOutbound.filter((r) => matchesSku(r, q)) : data.otherOutbound,
    }),
    [data, q]
  );

  const emptyText = q ? labels.no_results : labels.empty;

  return (
    <div className="p-4 md:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{labels.page_header}</h1>
          <p className="text-zinc-500 text-sm mt-1">{labels.header_description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500 mr-1">{labels.office_day}</span>
          <button
            onClick={() => goTo(shiftDate(date, -1))}
            title={labels.previous_day}
            aria-label={labels.previous_day}
            className="px-2.5 py-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
          >
            ‹
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => goTo(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 [color-scheme:dark]"
          />
          <button
            onClick={() => goTo(shiftDate(date, 1))}
            disabled={date >= today}
            title={labels.next_day}
            aria-label={labels.next_day}
            className="px-2.5 py-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            ›
          </button>
          <button
            onClick={() => {
              setDate(today);
              load(null);
            }}
            disabled={date === today}
            className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {labels.today}
          </button>
          <RefreshButton onClick={() => load(date === today ? null : date)} loading={loading} />
        </div>
      </header>

      {/* The exact window the numbers cover, in WIB. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-zinc-300">
          {data.windowStart} → {data.isCurrent ? `${labels.window_until_now} (${data.generatedAt})` : data.windowEnd}
        </span>
        <span className="text-xs text-zinc-600">
          WIB · {data.officeHour} → {data.officeHour}
        </span>
        {data.isCurrent && (
          <span className="text-xs text-zinc-600">{labels.updated_at.replace("{time}", data.generatedAt.slice(11))}</span>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {isFuture ? (
        <p className="text-sm text-zinc-500">{labels.future_day}</p>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard label={labels.card_production_in} value={sum(data.production)} unit={labels.cartons} tone="in" />
            <StatCard label={labels.card_other_in} value={sum(data.otherInbound)} unit={labels.cartons} tone="in" />
            <StatCard label={labels.card_shipped} value={sum(data.shipped)} unit={labels.cartons} tone="out" />
            <StatCard label={labels.card_other_out} value={sum(data.otherOutbound)} unit={labels.cartons} tone="out" />
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.search_placeholder}
            className="w-full mb-6 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />

          <SectionTitle>{labels.section_inbound}</SectionTitle>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
            <Panel title={labels.production_title} count={view.production.length}>
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-zinc-900 text-zinc-500 text-left">
                    <th className="px-3 py-2 font-medium">{labels.th_mo}</th>
                    <th className="px-3 py-2 font-medium">{labels.th_sku}</th>
                    <th className="px-3 py-2 font-medium">{labels.th_product}</th>
                    <th className="px-3 py-2 font-medium text-right">{labels.th_qty}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.production.length === 0 ? (
                    <EmptyRow colSpan={4} text={emptyText} />
                  ) : (
                    view.production.map((r) => (
                      <tr key={`${r.workOrderNumber}-${r.itemId}`} className="border-t border-zinc-800/70">
                        <td className="px-3 py-2 font-mono text-xs text-zinc-300 whitespace-nowrap">
                          {r.workOrderNumber ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-300 whitespace-nowrap">{r.sku}</td>
                        <td className="px-3 py-2 text-zinc-400">{r.name}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.quantity)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {view.production.length > 0 && <TotalRow colSpan={3} label={labels.total} value={sum(view.production)} />}
              </table>
            </Panel>

            <SkuPanel
              title={labels.other_in_title}
              rows={view.otherInbound}
              labels={labels}
              emptyText={emptyText}
              onDetails={(row) => setDetails({ row, kind: "other" })}
            />
          </div>

          <SectionTitle>{labels.section_outbound}</SectionTitle>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SkuPanel
              title={labels.shipped_title}
              rows={view.shipped}
              labels={labels}
              emptyText={emptyText}
              onDetails={(row) => setDetails({ row, kind: "shipped" })}
            />
            <SkuPanel
              title={labels.other_out_title}
              rows={view.otherOutbound}
              labels={labels}
              emptyText={emptyText}
              onDetails={(row) => setDetails({ row, kind: "other" })}
            />
          </div>
        </div>
      )}

      {details && <DetailsModal target={details} labels={labels} search={q} onClose={() => setDetails(null)} />}
    </div>
  );
}

function SkuPanel({
  title,
  rows,
  labels,
  emptyText,
  onDetails,
}: {
  title: string;
  rows: SkuRow[];
  labels: Record<string, string>;
  emptyText: string;
  onDetails: (row: SkuRow) => void;
}) {
  return (
    <Panel title={title} count={rows.length}>
      <table className="w-full text-sm">
        <thead className="sticky top-0">
          <tr className="bg-zinc-900 text-zinc-500 text-left">
            <th className="px-3 py-2 font-medium">{labels.th_sku}</th>
            <th className="px-3 py-2 font-medium">{labels.th_product}</th>
            <th className="px-3 py-2 font-medium text-right">{labels.th_qty}</th>
            <th className="px-3 py-2 font-medium text-right">{labels.th_details}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={4} text={emptyText} />
          ) : (
            rows.map((r) => (
              <tr key={r.itemId} className="border-t border-zinc-800/70">
                <td className="px-3 py-2 font-mono text-xs text-zinc-300 whitespace-nowrap">{r.sku}</td>
                <td className="px-3 py-2 text-zinc-400">{r.name}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.quantity)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onDetails(r)}
                    className="px-2.5 py-1 rounded-md border border-zinc-700 text-xs text-zinc-300 hover:text-amber-400 hover:border-amber-500/60 whitespace-nowrap"
                  >
                    {labels.details_button} ({r.details.length})
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <TotalRow colSpan={2} label={labels.total} value={sum(rows)} trailing />
        )}
      </table>
    </Panel>
  );
}

function DetailsModal({
  target,
  labels,
  search,
  onClose,
}: {
  target: DetailsTarget;
  labels: Record<string, string>;
  search: string;
  onClose: () => void;
}) {
  const { row, kind } = target;
  const title = (kind === "shipped" ? labels.modal_shipped_title : labels.modal_other_title).replace("{sku}", row.sku);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isHit = (d: DetailLine) =>
    !!search && (d.ref.toLowerCase().includes(search) || (d.note ?? "").toLowerCase().includes(search));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{row.name}</p>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-zinc-900 text-zinc-500 text-left">
                <th className="px-4 py-2 font-medium">{kind === "shipped" ? labels.th_so : labels.th_transaction}</th>
                <th className="px-4 py-2 font-medium">{labels.th_note}</th>
                <th className="px-4 py-2 font-medium text-right">{labels.th_qty}</th>
              </tr>
            </thead>
            <tbody>
              {row.details.map((d, i) => (
                <tr
                  key={`${d.ref}-${i}`}
                  className={`border-t border-zinc-800/70 ${isHit(d) ? "bg-amber-500/10" : ""}`}
                >
                  <td className="px-4 py-2 font-mono text-xs text-zinc-200 whitespace-nowrap">{d.ref}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{d.note ?? ""}</td>
                  <td className={`px-4 py-2 text-right font-mono ${d.quantity < 0 ? "text-red-400" : ""}`}>
                    {fmt(d.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700">
                <td className="px-4 py-2 text-zinc-500" colSpan={2}>
                  {labels.total}
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(row.quantity)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            {labels.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold mb-3">{children}</h2>;
}

function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-zinc-500 font-mono">{count}</span>
      </div>
      <div className="max-h-[480px] overflow-auto">{children}</div>
    </section>
  );
}

function StatCard({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: "in" | "out" }) {
  return (
    <div className="border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-900/30">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={`text-2xl font-mono ${tone === "in" ? "text-emerald-400" : "text-amber-500"}`}>
          {fmt(value)}
        </span>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-zinc-600">
        {text}
      </td>
    </tr>
  );
}

function TotalRow({
  colSpan,
  label,
  value,
  trailing,
}: {
  colSpan: number;
  label: string;
  value: number;
  trailing?: boolean;
}) {
  return (
    <tfoot className="sticky bottom-0">
      <tr className="border-t border-zinc-700 bg-zinc-900">
        <td className="px-3 py-2 text-zinc-500" colSpan={colSpan}>
          {label}
        </td>
        <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(value)}</td>
        {trailing && <td />}
      </tr>
    </tfoot>
  );
}
