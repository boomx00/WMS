"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshButton from "@/components/RefreshButton";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { shiftDate } from "@/lib/officeDay";
import { formatTruckTime } from "@/app/sales-orders/components/helpers";
import type { CompletedOrder, DashboardData, DetailLine, MovementRow } from "@/lib/dashboard";

// While the current office day is shown, the numbers refresh on their own.
const AUTO_REFRESH_MS = 60_000;

const fmt = (n: number) => n.toLocaleString("en-US");
const total = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((t, r) => t + pick(r), 0);

// Last shipping − first picking, e.g. "2h 15m". "—" if there was no
// picking, or the span is zero/negative.
function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

const lineMatches = (d: DetailLine, q: string) =>
  d.ref.toLowerCase().includes(q) || (d.note ?? "").toLowerCase().includes(q);

function matchesOrder(o: CompletedOrder, q: string) {
  return o.document.toLowerCase().includes(q) || (o.typeName ?? "").toLowerCase().includes(q);
}

// ------------------------------------------------------------------
// Inbound / Outbound tables share one shape: SKU, product, two source
// columns (Production + Other, or Sales Orders + Other), and a total.
// ------------------------------------------------------------------

type Direction = "in" | "out";

const DIRECTION = {
  in: {
    a: (r: MovementRow) => r.productionIn,
    b: (r: MovementRow) => r.otherIn,
    total: (r: MovementRow) => r.totalIn,
    lines: (r: MovementRow) => r.inbound,
  },
  out: {
    a: (r: MovementRow) => r.salesOut,
    b: (r: MovementRow) => r.otherOut,
    total: (r: MovementRow) => r.totalOut,
    lines: (r: MovementRow) => r.outbound,
  },
} as const;

type SortKey = "sku" | "name" | "a" | "b" | "total";
type SortDir = "asc" | "desc";
type Sort = { key: SortKey; dir: SortDir };

const TEXT_KEYS: SortKey[] = ["sku", "name"];
const DEFAULT_SORT: Sort = { key: "total", dir: "desc" };

function sortRows(rows: MovementRow[], direction: Direction, sort: Sort): MovementRow[] {
  const d = DIRECTION[direction];
  const value = (r: MovementRow): string | number =>
    sort.key === "sku" ? r.sku : sort.key === "name" ? r.name : d[sort.key](r);
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    const cmp =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    // Ties always fall back to SKU ascending, so the order is stable.
    return cmp !== 0 ? cmp * sign : x.sku.localeCompare(y.sku, undefined, { numeric: true });
  });
}

export default function DashboardClient({ initial }: { initial: DashboardData }) {
  const labels = usePageLabels("dashboard_page");

  const [data, setData] = useState<DashboardData>(initial);
  const [date, setDate] = useState(initial.date);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<{ row: MovementRow; direction: Direction } | null>(null);
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

  // Each table only lists SKUs that moved in that direction. Search matches
  // the SKU, the product, or that direction's references (MO / SO /
  // ZXCKWMS), so an SO number finds its SKUs in Outbound only.
  const [inboundRows, outboundRows] = useMemo(() => {
    const pick = (direction: Direction) => {
      const d = DIRECTION[direction];
      return data.movement.filter((r) => {
        if (d.total(r) === 0 && d.lines(r).length === 0) return false;
        if (!q) return true;
        return (
          r.sku.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          d.lines(r).some((line) => lineMatches(line, q))
        );
      });
    };
    return [pick("in"), pick("out")];
  }, [data.movement, q]);

  const orders = useMemo(
    () => (q ? data.completedOrders.filter((o) => matchesOrder(o, q)) : data.completedOrders),
    [data.completedOrders, q]
  );

  // Cards always show the whole office day, not the search.
  const all = data.movement;
  const productionIn = total(all, (r) => r.productionIn);
  const otherIn = total(all, (r) => r.otherIn);
  const salesOut = total(all, (r) => r.salesOut);
  const otherOut = total(all, (r) => r.otherOut);

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
            <StatCard
              label={labels.card_total_in}
              value={productionIn + otherIn}
              unit={labels.cartons}
              tone="in"
              sub={labels.card_in_breakdown.replace("{production}", fmt(productionIn)).replace("{other}", fmt(otherIn))}
            />
            <StatCard
              label={labels.card_total_out}
              value={salesOut + otherOut}
              unit={labels.cartons}
              tone="out"
              sub={labels.card_out_breakdown.replace("{sales}", fmt(salesOut)).replace("{other}", fmt(otherOut))}
            />
            <StatCard label={labels.card_skus_moved} value={all.length} unit="SKU" />
            <StatCard label={labels.card_completed} value={data.completedOrders.length} unit={labels.orders} />
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.search_placeholder}
            className="w-full mb-6 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 mb-8">
            <MovementTable
              direction="in"
              title={labels.inbound_title}
              aLabel={labels.th_production}
              rows={inboundRows}
              labels={labels}
              emptyText={emptyText}
              onDetails={(row) => setDetails({ row, direction: "in" })}
            />
            <MovementTable
              direction="out"
              title={labels.outbound_title}
              aLabel={labels.th_sales_orders}
              rows={outboundRows}
              labels={labels}
              emptyText={emptyText}
              onDetails={(row) => setDetails({ row, direction: "out" })}
            />
          </div>

          <Panel title={labels.completed_title} info={labels.completed_info} count={orders.length}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-3 py-2 font-medium">{labels.th_document}</th>
                  <th className="px-3 py-2 font-medium">{labels.th_first_pick}</th>
                  <th className="px-3 py-2 font-medium">{labels.th_last_ship}</th>
                  <th className="px-3 py-2 font-medium text-right">{labels.th_time_needed}</th>
                  <th className="px-3 py-2 font-medium text-right">{labels.th_cartons}</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <EmptyRow colSpan={5} text={emptyText} />
                ) : (
                  orders.map((o) => (
                    <tr key={o.salesOrderId} className="border-t border-zinc-800/70">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-200 whitespace-nowrap">{o.document}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400 whitespace-nowrap">
                        {formatTruckTime(o.firstPick)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-400 whitespace-nowrap">
                        {formatTruckTime(o.lastShip)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-amber-500 whitespace-nowrap">
                        {formatDuration(o.durationMs)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(o.cartons)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {details && (
        <DetailsModal
          row={details.row}
          direction={details.direction}
          labels={labels}
          search={q}
          onClose={() => setDetails(null)}
        />
      )}
    </div>
  );
}

function MovementTable({
  direction,
  title,
  aLabel,
  rows,
  labels,
  emptyText,
  onDetails,
}: {
  direction: Direction;
  title: string;
  aLabel: string; // "Production" or "Sales Orders"
  rows: MovementRow[];
  labels: Record<string, string>;
  emptyText: string;
  onDetails: (row: MovementRow) => void;
}) {
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const sorted = useMemo(() => sortRows(rows, direction, sort), [rows, direction, sort]);
  const d = DIRECTION[direction];
  const tone = direction === "in" ? "in" : "out";

  // Same column again flips the order; a new column starts A→Z for text
  // and biggest-first for numbers.
  function toggle(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: TEXT_KEYS.includes(key) ? "asc" : "desc" }
    );
  }

  const header = (key: SortKey, label: string, numeric: boolean) => (
    <SortHeader
      label={label}
      active={sort.key === key}
      dir={sort.dir}
      numeric={numeric}
      hint={labels.sort_hint}
      onClick={() => toggle(key)}
    />
  );

  return (
    <Panel title={title} count={rows.length} tone={tone}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-zinc-900 text-zinc-500 text-left">
            {header("sku", labels.th_sku, false)}
            {header("name", labels.th_product, false)}
            {header("a", aLabel, true)}
            {header("b", labels.th_other, true)}
            {header("total", labels.th_total, true)}
            <th className="px-3 py-2 font-medium text-right">{labels.th_details}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <EmptyRow colSpan={6} text={emptyText} />
          ) : (
            sorted.map((r) => (
              <tr key={r.itemId} className="border-t border-zinc-800/70">
                <td className="px-3 py-2 font-mono text-xs text-zinc-300 whitespace-nowrap">{r.sku}</td>
                <td className="px-3 py-2 text-zinc-400 min-w-[10rem]">{r.name}</td>
                <Num value={d.a(r)} />
                <Num value={d.b(r)} />
                <Num value={d.total(r)} strong tone={tone} />
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onDetails(r)}
                    className="px-2.5 py-1 rounded-md border border-zinc-700 text-xs text-zinc-300 hover:text-amber-400 hover:border-amber-500/60 whitespace-nowrap"
                  >
                    {labels.details_button}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot className="sticky bottom-0">
            <tr className="border-t border-zinc-700 bg-zinc-900">
              <td className="px-3 py-2 text-zinc-500" colSpan={2}>
                {labels.total}
              </td>
              <Num value={total(sorted, d.a)} />
              <Num value={total(sorted, d.b)} />
              <Num value={total(sorted, d.total)} strong tone={tone} />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </Panel>
  );
}

function SortHeader({
  label,
  active,
  dir,
  numeric,
  hint,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  numeric: boolean;
  hint: string;
  onClick: () => void;
}) {
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2 font-medium whitespace-nowrap ${numeric ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        title={hint}
        className={`inline-flex items-center gap-1 hover:text-zinc-200 ${active ? "text-zinc-200" : ""} ${
          numeric ? "flex-row-reverse" : ""
        }`}
      >
        <span>{label}</span>
        <span className={`text-[10px] w-2 ${active ? "text-amber-500" : "text-zinc-700"}`} aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function DetailsModal({
  row,
  direction,
  labels,
  search,
  onClose,
}: {
  row: MovementRow;
  direction: Direction;
  labels: Record<string, string>;
  search: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kindLabel: Record<DetailLine["kind"], string> = {
    MO: labels.kind_mo,
    SO: labels.kind_so,
    TAMBAHAN: labels.kind_tambahan,
    OTHER: labels.kind_other,
  };

  const d = DIRECTION[direction];
  const lines = d.lines(row);
  const title = (direction === "in" ? labels.modal_inbound_title : labels.modal_outbound_title).replace(
    "{sku}",
    row.sku
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{row.name}</p>
        </div>

        <div className="overflow-auto">
          {lines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-zinc-600">{labels.modal_none}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-4 py-2 font-medium">{labels.th_reference}</th>
                  <th className="px-4 py-2 font-medium">{labels.th_note}</th>
                  <th className="px-4 py-2 font-medium text-right">{labels.th_qty}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr
                    key={`${line.kind}-${line.ref}-${i}`}
                    className={`border-t border-zinc-800/70 ${search && lineMatches(line, search) ? "bg-amber-500/10" : ""}`}
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="font-mono text-xs text-zinc-200">{line.ref}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-600">
                        {kindLabel[line.kind]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{line.note ?? ""}</td>
                    <td className={`px-4 py-2 text-right font-mono ${line.quantity < 0 ? "text-red-400" : ""}`}>
                      {fmt(line.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700">
                  <td className="px-4 py-2 text-zinc-500" colSpan={2}>
                    {labels.total}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-mono font-semibold ${
                      direction === "in" ? "text-emerald-400" : "text-amber-500"
                    }`}
                  >
                    {fmt(d.total(row))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
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

// An "i" that shows `text` on hover — or on tap / keyboard focus, since
// there's no hover on a phone.
function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        aria-label={text}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-zinc-600 text-[10px] font-semibold leading-none text-zinc-400 hover:text-amber-400 hover:border-amber-500/60 focus:outline-none focus:text-amber-400 focus:border-amber-500/60 cursor-help"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-normal normal-case tracking-normal text-zinc-300 shadow-lg hidden group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

function Panel({
  title,
  info,
  count,
  tone,
  className = "",
  children,
}: {
  title: string;
  info?: string;
  count: number;
  tone?: "in" | "out";
  className?: string;
  children: React.ReactNode;
}) {
  const dot = tone === "in" ? "bg-emerald-400" : tone === "out" ? "bg-amber-500" : null;
  return (
    <section className={`border border-zinc-800 rounded-lg bg-zinc-900/30 flex flex-col min-w-0 ${className}`}>
      {/* Not overflow-hidden on the section, so the info tooltip can spill
          out over the table below. */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between rounded-t-lg">
        <h2 className="text-sm font-medium flex items-center gap-2">
          {dot && <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden />}
          {title}
          {info && <InfoTip text={info} />}
        </h2>
        <span className="text-xs text-zinc-500 font-mono">{count}</span>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-b-lg">{children}</div>
    </section>
  );
}

function Num({ value, strong, tone }: { value: number; strong?: boolean; tone?: "in" | "out" }) {
  const color = value === 0 ? "text-zinc-600" : tone === "in" ? "text-emerald-400" : tone === "out" ? "text-amber-500" : "";
  return (
    <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${strong ? "font-semibold" : ""} ${color}`}>
      {fmt(value)}
    </td>
  );
}

function StatCard({
  label,
  value,
  unit,
  tone,
  sub,
}: {
  label: string;
  value: number;
  unit: string;
  tone?: "in" | "out";
  sub?: string;
}) {
  return (
    <div className="border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-900/30">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className={`text-2xl font-mono ${tone === "in" ? "text-emerald-400" : tone === "out" ? "text-amber-500" : ""}`}
        >
          {fmt(value)}
        </span>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1 font-mono">{sub}</div>}
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
