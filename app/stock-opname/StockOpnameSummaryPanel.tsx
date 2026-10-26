"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { STOCK_OPNAME_SUMMARY_LABELS } from "@/lib/stockOpnameSummaryLabels";

// Stock Opname → Stock Opname Summary: every product, and for each day it
// had a per-SKU (SOSKU) opname, System / SO / Δ per Total Stock column
// (Good Stock, Defect, ...). New opname days appear as new column groups on
// the right. Detail (pencil) shows the product's full opname history.

type Figures = { system: number; counted: number };
type Bucket = { key: string; name: string };
type Status = "IN_PROGRESS" | "DONE" | "CONFIRMED";

type Cell = {
  opnameNumber: string;
  lockedAt: string;
  status: Status;
  by: string | null;
  buckets: Record<string, Figures>;
  unaccounted: number;
  sessionsThatDay: number;
};

type SummaryResponse = {
  warehouse: { id: number; name: string };
  warehouses: { id: number; name: string; isActive: boolean }[];
  buckets: Bucket[];
  dates: string[];
  items: { itemId: number; sku: string; name: string; currentStock: number; cells: Record<string, Cell> }[];
};

type DetailLine = {
  locationCode: string;
  bucket: string;
  systemQty: number;
  countedQty: number;
  countedAt: string | null;
  countedBy: string | null;
};

type DetailEntry = Omit<Cell, "sessionsThatDay"> & { date: string; lines: DetailLine[] };

type DetailResponse = {
  item: { itemId: number; sku: string; name: string };
  buckets: Bucket[];
  entries: DetailEntry[];
};

const EMPTY: Figures = { system: 0, counted: 0 };
const figures = (cell: { buckets: Record<string, Figures> } | undefined, key: string): Figures =>
  cell?.buckets[key] ?? EMPTY;

const storageKey = (warehouseId: number) => `stockOpnameSummary.columns.${warehouseId}`;
function readStored(warehouseId: number): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey(warehouseId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : null;
  } catch {
    return null;
  }
}
function writeStored(warehouseId: number, keys: string[]) {
  try {
    window.localStorage.setItem(storageKey(warehouseId), JSON.stringify(keys));
  } catch {
    // private window / storage blocked — the choice just isn't remembered
  }
}

// Products hidden from the table with the row's hide button. Kept in this
// browser only (same as the column choice), for every warehouse.
const HIDDEN_KEY = "stockOpnameSummary.hiddenItems";
function readHidden(): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}
function writeHidden(ids: number[]) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    // private window / storage blocked — hiding just isn't remembered
  }
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Table sort: by SKU (A→Z first) or by current Total Stock (highest first).
// A third click on the same header goes back to the API's order.
type SortKey = "sku" | "stock";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

function nextSort(current: Sort, key: SortKey): Sort {
  const first = key === "stock" ? "desc" : "asc";
  if (!current || current.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-0.5 hover:text-zinc-200 transition-colors ${active ? "text-amber-400" : ""} ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      {label}
      <span className={active ? "" : "text-zinc-700"}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}

// Columns shown by default: those anything was counted in (Good Stock,
// Defect, ...); if nothing was counted yet, those with system stock.
function defaultBucketKeys(data: SummaryResponse): string[] {
  const keys = data.buckets.filter((b) => b.key !== "total").map((b) => b.key);
  const any = (field: keyof Figures) =>
    keys.filter((k) => data.items.some((i) => Object.values(i.cells).some((c) => figures(c, k)[field] !== 0)));
  const counted = any("counted");
  if (counted.length > 0) return counted;
  const system = any("system");
  return system.length > 0 ? system : keys.slice(0, 1);
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function formatDay(date: string): { day: string; weekday: string } {
  const d = new Date(`${date}T00:00:00`);
  return {
    day: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
  };
}

function Delta({ value, muted = false }: { value: number; muted?: boolean }) {
  if (value === 0) return <span className={muted ? "text-zinc-600" : "text-emerald-500"}>0</span>;
  return (
    <span className={value > 0 ? "text-amber-400" : "text-red-400"}>
      {value > 0 ? "+" : ""}
      {value.toLocaleString()}
    </span>
  );
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

export default function StockOpnameSummaryPanel() {
  const labels = usePageLabels("stock_opname", STOCK_OPNAME_SUMMARY_LABELS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [hideNever, setHideNever] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ itemId: number; date: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (warehouseId) params.set("warehouseId", String(warehouseId));
    fetch(`/api/stock-opname/summary?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Failed to load (${res.status})`);
        return json as SummaryResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSelected((current) => {
          if (current && json.warehouse.id === warehouseId) return current;
          return readStored(json.warehouse.id) ?? defaultBucketKeys(json);
        });
        if (warehouseId === null) setWarehouseId(json.warehouse.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, warehouseId]);

  useEffect(() => {
    setHiddenIds(readHidden());
  }, []);

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  function toggleHidden(itemId: number) {
    setHiddenIds((current) => {
      const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
      writeHidden(next);
      return next;
    });
  }

  // Newest dates are on the right: start scrolled there.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [data]);

  const buckets = useMemo(() => {
    if (!data || !selected) return [];
    return data.buckets
      .filter((b) => selected.includes(b.key))
      .map((b) => ({
        ...b,
        name: b.key === "other" ? labels.summary_other : b.key === "total" ? labels.summary_total : b.name,
      }));
  }, [data, selected, labels]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = data.items.filter((item) => {
      if (q && !item.sku.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false;
      if (!showHidden && hiddenSet.has(item.itemId)) return false;
      const cells = Object.values(item.cells);
      if (hideNever && cells.length === 0) return false;
      if (onlyDiff) {
        const hasDiff = cells.some((c) => buckets.some((b) => figures(c, b.key).counted !== figures(c, b.key).system));
        if (!hasDiff) return false;
      }
      return true;
    });
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.key === "stock"
        ? (a.currentStock - b.currentStock) * factor || a.sku.localeCompare(b.sku)
        : a.sku.localeCompare(b.sku, undefined, { numeric: true }) * factor
    );
  }, [data, search, hideNever, onlyDiff, buckets, showHidden, hiddenSet, sort]);

  function toggleBucket(key: string) {
    if (!data || !selected) return;
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    // Keep the warehouse's column order.
    const ordered = data.buckets.map((b) => b.key).filter((k) => next.includes(k));
    setSelected(ordered);
    writeStored(data.warehouse.id, ordered);
  }

  function changeWarehouse(id: number) {
    setSelected(null);
    setWarehouseId(id);
  }

  const stockLabel = labels.summary_th_stock ?? "Total stock";

  function exportExcel() {
    if (!data) return;
    const header1: (string | number)[] = [labels.summary_th_sku, labels.summary_th_product, stockLabel];
    const header2: (string | number)[] = ["", "", ""];
    const merges: XLSX.Range[] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    ];
    if (buckets.length > 0) {
      for (const date of data.dates) {
        const start = header1.length;
        header1.push(date, ...Array(buckets.length * 3 - 1).fill(""));
        for (const b of buckets) {
          header2.push(`${b.name} ${labels.summary_system}`, `${b.name} ${labels.summary_so}`, labels.summary_delta);
        }
        merges.push({ s: { r: 0, c: start }, e: { r: 0, c: start + buckets.length * 3 - 1 } });
      }
    }
    const body = rows.map((item) => {
      const row: (string | number)[] = [item.sku, item.name, item.currentStock];
      for (const date of data.dates) {
        const cell = item.cells[date];
        for (const b of buckets) {
          if (!cell) {
            row.push("", "", "");
          } else {
            const f = figures(cell, b.key);
            row.push(f.system, f.counted, f.counted - f.system);
          }
        }
      }
      return row;
    });
    const sheet = XLSX.utils.aoa_to_sheet([header1, header2, ...body]);
    sheet["!merges"] = merges;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Stock Opname Summary");
    const range = from || to ? `-${from || "start"}_${to || "now"}` : "";
    XLSX.writeFile(book, `stock-opname-summary${range}.xlsx`, { bookType: "xlsx" });
  }

  const input =
    "px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 focus:outline-none focus:border-amber-500";
  const small =
    "px-3 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors";
  const span = buckets.length * 3;

  // Table layout. SKU / Product name share one column, pinned left; its
  // box-shadow paints a divider line plus a strip of page background, so
  // scrolled date blocks never run flush under it. Every date block is its
  // columns plus its own Detail (pencil) column. `gap` is the empty column
  // before every date block, which separates the dates from each other.
  const blockSpan = span + 1;
  const stickyLeft =
    "sticky left-0 min-w-40 max-w-56 shadow-[1px_0_0_var(--color-zinc-700),12px_0_0_var(--color-zinc-950)]";
  const gap = "w-4 min-w-4 p-0 bg-zinc-950";
  const subHead =
    "px-1.5 py-1 text-right align-bottom font-medium bg-zinc-900 border-b border-zinc-700 whitespace-nowrap";
  const dataCell =
    "px-1.5 py-1 text-right font-mono bg-zinc-900/30 border-t border-zinc-800/70 group-hover:bg-zinc-900/70";

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-4 max-w-3xl">{labels.summary_description}</p>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="text-xs text-zinc-500">
          <span className="block mb-1">{labels.summary_from}</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} aria-label={labels.summary_from} />
        </label>
        <label className="text-xs text-zinc-500">
          <span className="block mb-1">{labels.summary_to}</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} aria-label={labels.summary_to} />
        </label>
        <button
          type="button"
          onClick={() => {
            const today = todayLocal();
            setFrom(today);
            setTo(today);
          }}
          className={small}
        >
          {labels.summary_today}
        </button>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className={small}
          >
            {labels.summary_clear}
          </button>
        )}
        {data && data.warehouses.length > 1 && (
          <label className="text-xs text-zinc-500">
            <span className="block mb-1">{labels.summary_warehouse}</span>
            <select
              value={warehouseId ?? ""}
              onChange={(e) => changeWarehouse(Number(e.target.value))}
              className={input}
              aria-label={labels.summary_warehouse}
            >
              {data.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.summary_search}
          className={`${input} flex-1 min-w-48`}
        />
        <button type="button" onClick={exportExcel} disabled={!data || loading} className={`${small} disabled:opacity-40`}>
          {labels.summary_export}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-sm">
        <span className="text-xs text-zinc-500">{labels.summary_columns}:</span>
        {data?.buckets.map((b) => (
          <label key={b.key} className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={selected?.includes(b.key) ?? false}
              onChange={() => toggleBucket(b.key)}
              className="h-4 w-4 accent-amber-500"
            />
            {b.key === "other" ? labels.summary_other : b.key === "total" ? labels.summary_total : b.name}
          </label>
        ))}
        <span className="w-px h-4 bg-zinc-800" />
        <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          {labels.summary_only_diff}
        </label>
        <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={hideNever} onChange={(e) => setHideNever(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          {labels.summary_hide_never}
        </label>
        {hiddenIds.length > 0 && (
          <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="h-4 w-4 accent-amber-500" />
            {(labels.summary_show_hidden ?? "Show hidden ({n})").replace("{n}", String(hiddenIds.length))}
          </label>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {data && (
        <p className="text-xs text-zinc-600 mb-2">
          {loading
            ? labels.summary_loading
            : labels.summary_rows.replace("{n}", rows.length.toLocaleString()).replace("{d}", String(data.dates.length))}
        </p>
      )}

      {!data ? (
        <p className="text-sm text-zinc-600">{loading ? labels.summary_loading : ""}</p>
      ) : (
        <div ref={scroller} className={`border border-zinc-800 rounded-lg overflow-auto max-h-[70vh] ${loading ? "opacity-60" : ""}`}>
          <table className="text-[10px] leading-tight border-separate border-spacing-0 min-w-full whitespace-nowrap">
            <thead className="sticky top-0 z-20">
              <tr className="text-zinc-500 text-left">
                <th rowSpan={2} className={`${stickyLeft} z-30 bg-zinc-900 px-2 py-1 font-medium align-bottom border-b border-zinc-800`}>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <SortHeader label={labels.summary_th_sku} sortKey="sku" sort={sort} onSort={(k) => setSort((c) => nextSort(c, k))} />
                      <div className="font-normal text-zinc-600">{labels.summary_th_product}</div>
                    </div>
                    <SortHeader
                      label={stockLabel}
                      sortKey="stock"
                      sort={sort}
                      onSort={(k) => setSort((c) => nextSort(c, k))}
                      align="right"
                    />
                  </div>
                </th>
                {data.dates.length === 0 ? (
                  <>
                    <th rowSpan={2} className={gap} aria-hidden="true" />
                    <th rowSpan={2} className="px-2 py-1 font-normal text-zinc-600 bg-zinc-900 border-b border-zinc-800">
                      {labels.summary_no_dates}
                    </th>
                  </>
                ) : (
                  data.dates.map((date) => {
                    const { day, weekday } = formatDay(date);
                    return (
                      <Fragment key={date}>
                        <th rowSpan={2} className={gap} aria-hidden="true" />
                        <th
                          colSpan={blockSpan}
                          className="px-2 py-1 font-semibold text-center text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-t whitespace-nowrap"
                        >
                          {day} <span className="text-zinc-500 font-normal">{weekday}</span>
                        </th>
                      </Fragment>
                    );
                  })
                )}
                <th rowSpan={2} className={gap} aria-hidden="true" />
              </tr>
              <tr className="text-zinc-400 text-[9px]">
                {data.dates.map((date) => (
                  <Fragment key={date}>
                    {buckets.map((b, i) => (
                      <Fragment key={`${date}-${b.key}`}>
                        <th className={`${subHead} border-l ${i === 0 ? "border-l-zinc-700" : "border-l-zinc-700/60"}`}>
                          {b.name}
                          <br />
                          {labels.summary_system}
                        </th>
                        <th className={subHead}>
                          {b.name}
                          <br />
                          {labels.summary_so}
                        </th>
                        <th className={subHead}>{labels.summary_delta}</th>
                      </Fragment>
                    ))}
                    <th className={`${subHead} text-center border-x border-l-zinc-700 border-r-zinc-700`}>
                      {labels.summary_th_detail}
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + (data.dates.length === 0 ? 2 : data.dates.length * (blockSpan + 1))}
                    className="px-4 py-6 text-center text-zinc-600"
                  >
                    {labels.summary_no_products}
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const isHidden = hiddenSet.has(item.itemId);
                  return (
                    <tr key={item.itemId} className={`group ${isHidden ? "opacity-40" : ""}`}>
                      <td className={`${stickyLeft} z-10 bg-zinc-950 group-hover:bg-zinc-900 px-2 py-1 border-t border-zinc-800/70`}>
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-mono text-amber-500">{item.sku}</span>
                              <span
                                title={stockLabel}
                                className={`font-mono ${item.currentStock === 0 ? "text-zinc-600" : "text-zinc-200"}`}
                              >
                                {item.currentStock.toLocaleString()}
                              </span>
                            </div>
                            <div className="text-zinc-400 truncate" title={item.name}>
                              {item.name}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleHidden(item.itemId)}
                            title={isHidden ? labels.summary_unhide ?? "Unhide" : labels.summary_hide ?? "Hide"}
                            aria-label={`${isHidden ? labels.summary_unhide ?? "Unhide" : labels.summary_hide ?? "Hide"} ${item.sku}`}
                            className={`shrink-0 p-0.5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-opacity ${
                              isHidden ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                            }`}
                          >
                            {isHidden ? <EyeIcon /> : <EyeOffIcon />}
                          </button>
                        </div>
                      </td>
                      {data.dates.length === 0 && (
                        <>
                          <td className={gap} aria-hidden="true" />
                          <td className="border-t border-zinc-800/70" />
                        </>
                      )}
                      {data.dates.map((date) => {
                          const cell = item.cells[date];
                          if (!cell) {
                            return (
                              <Fragment key={date}>
                                <td className={gap} aria-hidden="true" />
                                <td
                                  colSpan={blockSpan}
                                  className="px-1.5 py-1 text-center text-zinc-700 bg-zinc-900/30 border-t border-x border-zinc-800/70 border-l-zinc-700 border-r-zinc-700 group-hover:bg-zinc-900/70"
                                >
                                  —
                                </td>
                              </Fragment>
                            );
                          }
                          const note = [
                            cell.status === "IN_PROGRESS" ? labels.summary_in_progress : null,
                            cell.sessionsThatDay > 1 ? labels.summary_sessions_that_day.replace("{n}", String(cell.sessionsThatDay)) : null,
                            `${cell.opnameNumber} · ${cell.lockedAt}${cell.by ? ` · ${cell.by}` : ""}`,
                          ]
                            .filter(Boolean)
                            .join("\n");
                          return (
                            <Fragment key={date}>
                              <td className={gap} aria-hidden="true" />
                              {buckets.map((b, i) => {
                                const f = figures(cell, b.key);
                                return (
                                  <Fragment key={`${date}-${b.key}`}>
                                    <td
                                      title={note}
                                      className={`${dataCell} text-zinc-400 border-l ${i === 0 ? "border-l-zinc-700" : "border-l-zinc-700/60"}`}
                                    >
                                      {i === 0 && (cell.status === "IN_PROGRESS" || cell.sessionsThatDay > 1) && (
                                        <span
                                          className={`inline-block w-1 h-1 rounded-full mr-1 align-middle ${cell.status === "IN_PROGRESS" ? "bg-amber-500" : "bg-sky-500"}`}
                                        />
                                      )}
                                      {f.system.toLocaleString()}
                                    </td>
                                    <td title={note} className={`${dataCell} text-zinc-100`}>
                                      {f.counted.toLocaleString()}
                                    </td>
                                    <td title={note} className={dataCell}>
                                      <Delta value={f.counted - f.system} />
                                    </td>
                                  </Fragment>
                                );
                              })}
                              <td className={`${dataCell} text-center border-x border-l-zinc-700 border-r-zinc-700`}>
                                <button
                                  type="button"
                                  onClick={() => setDetail({ itemId: item.itemId, date })}
                                  title={`${labels.summary_th_detail} · ${cell.opnameNumber}`}
                                  aria-label={`${labels.summary_th_detail} ${item.sku} ${date}`}
                                  className="inline-flex items-center gap-0.5 p-0.5 rounded text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
                                >
                                  <PencilIcon />
                                  {cell.sessionsThatDay > 1 && <span className="text-[8px]">×{cell.sessionsThatDay}</span>}
                                </button>
                              </td>
                            </Fragment>
                          );
                        })}
                      <td className={gap} aria-hidden="true" />
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail !== null && data && (
        <OpnameHistoryModal
          itemId={detail.itemId}
          date={detail.date}
          warehouseId={data.warehouse.id}
          bucketKeys={selected ?? []}
          labels={labels}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// The SOSKU opname(s) of one product on one date (newest first), with
// System / SO / Δ per column, how the difference moved since that product's
// previous opname (which may be on an earlier date), and the counted lines
// behind each — expanded by default.
function OpnameHistoryModal({
  itemId,
  date,
  warehouseId,
  bucketKeys,
  labels,
  onClose,
}: {
  itemId: number;
  date: string;
  warehouseId: number;
  bucketKeys: string[];
  labels: Record<string, string>;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/stock-opname/summary/${itemId}?warehouseId=${warehouseId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Failed to load (${res.status})`);
        setDetail(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [itemId, warehouseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The tab's columns, plus Total (always).
  const buckets = useMemo(() => {
    if (!detail) return [];
    const name = (b: Bucket) => (b.key === "other" ? labels.summary_other : b.key === "total" ? labels.summary_total : b.name);
    return detail.buckets
      .filter((b) => b.key === "total" || bucketKeys.includes(b.key))
      .map((b) => ({ ...b, name: name(b) }));
  }, [detail, bucketKeys, labels]);
  const bucketName = (key: string) =>
    key === "outside"
      ? "—"
      : key === "other"
        ? labels.summary_other
        : detail?.buckets.find((b) => b.key === key)?.name ?? key;

  // Full history newest first (for "change since previous"), and the
  // entries of the chosen date that the modal lists.
  const history = useMemo(() => (detail ? [...detail.entries].reverse() : []), [detail]);
  const entries = useMemo(() => history.filter((e) => e.date === date), [history, date]);

  // Show the counted lines of that date's opname(s) straight away.
  useEffect(() => {
    setOpen(new Set(entries.map((e) => e.opnameNumber)));
  }, [entries]);
  const statusLabel = (s: Status) =>
    s === "CONFIRMED" ? labels.status_confirmed : s === "DONE" ? labels.status_done : labels.status_in_progress;
  const colCount = 5 + buckets.length * 3;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {labels.detail_title}{" "}
              <span className="text-zinc-500 font-normal">
                · {formatDay(date).day} {formatDay(date).weekday}
              </span>
            </h2>
            {detail && (
              <p className="text-sm text-zinc-500 mt-0.5">
                <span className="font-mono text-amber-500">{detail.item.sku}</span> {detail.item.name}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100">
            {labels.detail_close}
          </button>
        </div>

        <div className="overflow-auto p-5">
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : !detail ? (
            <p className="text-sm text-zinc-600">{labels.summary_loading}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-zinc-600">{labels.detail_none}</p>
          ) : (
            <table className="text-sm border-separate border-spacing-0 min-w-full">
              <thead>
                <tr className="text-zinc-500 text-left text-xs">
                  <th rowSpan={2} className="px-2 py-2 font-medium border-b border-zinc-800">{labels.detail_th_date}</th>
                  <th rowSpan={2} className="px-2 py-2 font-medium border-b border-zinc-800">{labels.detail_th_session}</th>
                  <th rowSpan={2} className="px-2 py-2 font-medium border-b border-zinc-800">{labels.detail_th_status}</th>
                  {buckets.map((b) => (
                    <th key={b.key} colSpan={3} className="px-2 py-2 font-medium text-center text-zinc-300 border-l border-b border-zinc-800">
                      {b.name}
                    </th>
                  ))}
                  <th rowSpan={2} className="px-2 py-2 font-medium text-right border-l border-b border-zinc-800 whitespace-nowrap">
                    {labels.detail_th_change}
                  </th>
                  <th rowSpan={2} className="border-b border-zinc-800" />
                </tr>
                <tr className="text-zinc-500 text-xs">
                  {buckets.map((b) => (
                    <Fragment key={b.key}>
                      <th className="px-2 py-1.5 font-medium text-right border-l border-b border-zinc-800">{labels.summary_system}</th>
                      <th className="px-2 py-1.5 font-medium text-right border-b border-zinc-800">{labels.summary_so}</th>
                      <th className="px-2 py-1.5 font-medium text-right border-b border-zinc-800">{labels.summary_delta}</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const key = `${entry.opnameNumber}`;
                  const previous = history[history.indexOf(entry) + 1];
                  const totalDelta = (e: DetailEntry) => figures(e, "total").counted - figures(e, "total").system;
                  const expanded = open.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className="hover:bg-zinc-900/50">
                        <td className="px-2 py-2 font-mono text-xs text-zinc-400 border-t border-zinc-800/70 whitespace-nowrap">{entry.lockedAt}</td>
                        <td className="px-2 py-2 border-t border-zinc-800/70 whitespace-nowrap">
                          <span className="font-mono text-xs text-amber-500">{entry.opnameNumber}</span>
                          {entry.by && <span className="text-xs text-zinc-600"> · {entry.by}</span>}
                        </td>
                        <td className="px-2 py-2 text-xs border-t border-zinc-800/70 whitespace-nowrap">
                          <span className={entry.status === "IN_PROGRESS" ? "text-amber-400" : entry.status === "CONFIRMED" ? "text-sky-400" : "text-emerald-400"}>
                            {statusLabel(entry.status)}
                          </span>
                        </td>
                        {buckets.map((b) => {
                          const f = figures(entry, b.key);
                          return (
                            <Fragment key={b.key}>
                              <td className="px-2 py-2 text-right font-mono text-zinc-400 border-t border-l border-zinc-800/70">{f.system.toLocaleString()}</td>
                              <td className="px-2 py-2 text-right font-mono text-zinc-100 border-t border-zinc-800/70">{f.counted.toLocaleString()}</td>
                              <td className="px-2 py-2 text-right font-mono border-t border-zinc-800/70">
                                <Delta value={f.counted - f.system} />
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className="px-2 py-2 text-right font-mono border-t border-l border-zinc-800/70">
                          {previous ? <Delta value={totalDelta(entry) - totalDelta(previous)} muted /> : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-2 py-2 border-t border-zinc-800/70 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                            aria-expanded={expanded}
                            className="text-xs text-zinc-500 hover:text-zinc-200"
                          >
                            {expanded ? "▼" : "▶"} {entry.lines.length}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={colCount} className="px-2 pb-3 pt-1 bg-zinc-900/30">
                            {entry.unaccounted !== 0 && (
                              <p className="text-xs text-amber-400 mb-2">
                                {labels.detail_unaccounted.replace("{n}", entry.unaccounted.toLocaleString())}
                              </p>
                            )}
                            {entry.lines.length === 0 ? (
                              <p className="text-xs text-zinc-600">{labels.detail_no_lines}</p>
                            ) : (
                              <table className="text-xs w-full">
                                <thead>
                                  <tr className="text-zinc-500 text-left">
                                    <th className="py-1.5 px-2 font-medium">{labels.detail_th_location}</th>
                                    <th className="py-1.5 px-2 font-medium">{labels.detail_th_column}</th>
                                    <th className="py-1.5 px-2 font-medium text-right">{labels.detail_th_system_at_count}</th>
                                    <th className="py-1.5 px-2 font-medium text-right">{labels.detail_th_counted}</th>
                                    <th className="py-1.5 px-2 font-medium text-right">{labels.summary_delta}</th>
                                    <th className="py-1.5 px-2 font-medium">{labels.detail_th_counted_at}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.lines.map((line) => (
                                    <tr key={line.locationCode} className="border-t border-zinc-800/60">
                                      <td className="py-1 px-2 font-mono text-amber-500">{line.locationCode}</td>
                                      <td className="py-1 px-2 text-zinc-400">{bucketName(line.bucket)}</td>
                                      <td className="py-1 px-2 text-right font-mono text-zinc-400">{line.systemQty.toLocaleString()}</td>
                                      <td className="py-1 px-2 text-right font-mono">{line.countedQty.toLocaleString()}</td>
                                      <td className="py-1 px-2 text-right font-mono">
                                        <Delta value={line.countedQty - line.systemQty} />
                                      </td>
                                      <td className="py-1 px-2 font-mono text-zinc-500 whitespace-nowrap">
                                        {line.countedAt ?? "—"}
                                        {line.countedBy ? ` · ${line.countedBy}` : ""}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
