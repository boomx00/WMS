"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { useLanguage } from "@/lib/LanguageContext";
import { columnNameFor } from "@/lib/columnNames";
import { STOCK_OPNAME_SUMMARY_LABELS } from "@/lib/stockOpnameSummaryLabels";
import type {
  Bucket,
  Reconciliation,
  Adjustment,
  AdjustTarget,
  SummaryResponse,
  Sort,
  DateSession,
} from "./_summary/types";
import {
  shownFigures,
  finalSoOf,
  excludedFrom,
  nextSort,
  defaultBucketKeys,
  round3,
  k3Of,
  sessionsByDate,
} from "./_summary/calc";
import { readStored, writeStored, readHidden, writeHidden } from "./_summary/storage";
import { shortOpname, todayLocal, useDateLocale, formatDay, fmtQty } from "./_summary/format";
import { EyeOffIcon, EyeIcon } from "./_summary/icons";
import { SortHeader } from "./_summary/SortHeader";
import { Delta } from "./_summary/Delta";
import { K3ImportDialog } from "./_summary/K3ImportDialog";
import { exportSummaryExcel } from "./_summary/exportSummaryExcel";
import { DateReportModal } from "./_summary/DateReportModal";
import { OpnameHistoryModal } from "./_summary/OpnameHistoryModal";
import { AdjustmentInput } from "./_summary/AdjustmentInput";
import { reconcileTitle, ReconcileInput } from "./_summary/ReconcileInput";

// Stock Opname → Stock Opname Summary: every product, and for each day it
// had a per-SKU (SOSKU) opname, System / SO / Δ per Total Stock column
// (Good Stock, Defect, ...). New opname days appear as new column groups on
// the right. Detail (pencil) shows the product's full opname history.

export default function StockOpnameSummaryPanel() {
  const labels = usePageLabels("stock_opname", STOCK_OPNAME_SUMMARY_LABELS);
  const locale = useDateLocale();
  const { language } = useLanguage();
  // A column's name as shown: Other / Total from the labels, a Total Stock
  // column in the picked language.
  const bucketLabel = (b: Bucket) =>
    b.key === "other" ? labels.summary_other : b.key === "total" ? labels.summary_total : columnNameFor(b, language);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [hideNever, setHideNever] = useState(false);
  // Read once on the client. The only UI that depends on it renders after
  // `data` has loaded, so the server render and first client render match.
  const [hiddenIds, setHiddenIds] = useState<number[]>(() => (typeof window === "undefined" ? [] : readHidden()));
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<Sort>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ itemId: number; date: string; opnameNumber: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The date whose report window is open.
  const [reportDate, setReportDate] = useState<string | null>(null);
  // Bumped to reload the summary (e.g. after a K3 import), keeping filters.
  const [reloadKey, setReloadKey] = useState(0);
  // The date whose Import K3 window (pick SOSKU sessions + file) is open.
  const [k3Date, setK3Date] = useState<string | null>(null);

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
        if (!res.ok) throw new Error(json.error ?? ""); // "" = the generic "failed to load" text
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
        if (!cancelled) setError(err instanceof Error ? err.message : "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, warehouseId, reloadKey]);

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  // Each date's SOSKU sessions, and how many of them have K3 data. A date
  // gets the K3 Stock / Δ K3 columns once any of its sessions has K3 data.
  const dateSessions = useMemo(() => (data ? sessionsByDate(data) : new Map<string, DateSession[]>()), [data]);
  const k3CountOf = (date: string) =>
    (dateSessions.get(date) ?? []).filter((s) => data?.k3Sessions?.[s.opnameNumber] !== undefined).length;
  const hasK3 = (date: string) => k3CountOf(date) > 0;

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
        name:
          b.key === "other" ? labels.summary_other : b.key === "total" ? labels.summary_total : columnNameFor(b, language),
      }));
  }, [data, selected, labels, language]);

  // Unticked columns, taken off each date's Total.
  const excludedKeys = useMemo(() => (data && selected ? excludedFrom(data.buckets, selected) : []), [data, selected]);
  const excludedNames = (data?.buckets ?? [])
    .filter((b) => excludedKeys.includes(b.key))
    .map((b) => bucketLabel(b));

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = data.items.filter((item) => {
      if (q && !item.sku.toLowerCase().includes(q) && !item.name.toLowerCase().includes(q)) return false;
      if (!showHidden && hiddenSet.has(item.itemId)) return false;
      const cells = Object.values(item.cells).flat();
      if (hideNever && cells.length === 0) return false;
      if (onlyDiff) {
        const hasDiff = Object.values(item.cells).some((list) =>
          list.some(
            (c) =>
              buckets.some((b) => {
                const f = shownFigures(c, b.key, excludedKeys);
                return f.counted !== f.system;
              }) ||
              // or Final SO doesn't match K3, for a session with K3 data
              (() => {
                const k3 = k3Of(data, item, c.opnameNumber);
                return !!k3 && round3(finalSoOf(c, excludedKeys) - k3.qty) !== 0;
              })()
          )
        );
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
  }, [data, search, hideNever, onlyDiff, buckets, showHidden, hiddenSet, sort, excludedKeys]);

  function toggleBucket(key: string) {
    if (!data || !selected) return;
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    // Keep the warehouse's column order.
    const ordered = data.buckets.map((b) => b.key).filter((k) => next.includes(k));
    setSelected(ordered);
    writeStored(data.warehouse.id, ordered);
  }

  // Put a saved / cleared adjustment into the loaded data, so the table
  // updates without reloading the whole summary.
  function applyAdjustment(target: AdjustTarget, adjustment: Adjustment | null) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item) => {
          const list = item.itemId === target.itemId ? item.cells[target.date] : undefined;
          if (!list?.some((c) => c.opnameNumber === target.opnameNumber)) return item;
          const next = list.map((c) => (c.opnameNumber === target.opnameNumber ? { ...c, adjustment } : c));
          return { ...item, cells: { ...item.cells, [target.date]: next } };
        }),
      };
    });
  }

  // Save what was typed in an Adj field ("" clears it). Returns an error
  // message when it couldn't be saved.
  async function saveAdjustment(target: AdjustTarget, note: string): Promise<{ error?: string }> {
    try {
      const res = await fetch("/api/stock-opname/summary/adjustment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opnameNumber: target.opnameNumber, itemId: target.itemId, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: json.error ?? `${labels.summary_err_save} (${res.status})` };
      applyAdjustment(target, json.adjustment ?? null);
      return {};
    } catch {
      return { error: labels.summary_err_save };
    }
  }
  // Save a report line's Reconciliation + or − (the other stays as it is).
  async function saveReconciliation(
    target: AdjustTarget,
    change: { plus?: number; minus?: number }
  ): Promise<{ error?: string }> {
    try {
      const res = await fetch("/api/stock-opname/summary/reconciliation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opnameNumber: target.opnameNumber, itemId: target.itemId, ...change }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: json.error ?? `${labels.summary_err_save} (${res.status})` };
      const reconciliation: Reconciliation | null = json.reconciliation ?? null;
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) => {
            const list = item.itemId === target.itemId ? item.cells[target.date] : undefined;
            if (!list?.some((c) => c.opnameNumber === target.opnameNumber)) return item;
            const next = list.map((c) => (c.opnameNumber === target.opnameNumber ? { ...c, reconciliation } : c));
            return { ...item, cells: { ...item.cells, [target.date]: next } };
          }),
        };
      });
      return {};
    } catch {
      return { error: labels.summary_err_save };
    }
  }

  function changeWarehouse(id: number) {
    setSelected(null);
    setWarehouseId(id);
  }

  const stockLabel = labels.summary_th_stock;
  const adjLabel = labels.summary_th_adjusted;
  const soskuLabel = labels.summary_th_sosku;
  const k3Label = labels.summary_th_k3;
  const k3DeltaLabel = labels.summary_th_k3_delta;
  const k3DeltaTitle = labels.summary_k3_delta_title;

  function exportExcel() {
    if (!data) return;
    exportSummaryExcel({ data, rows, buckets, excludedKeys, labels, hasK3, from, to });
  }

  const input =
    "px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 focus:outline-none focus:border-amber-500";
  const small =
    "px-3 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors";
  const span = buckets.length * 3;

  // Table layout. SKU / Product name share one column, pinned left; its
  // box-shadow paints a divider line plus a strip of page background, so
  // scrolled date blocks never run flush under it. Every date block is its
  // columns plus its own Adj (checkbox) and Detail (pencil) columns. `gap`
  // is the empty column before every date block, which separates the dates
  // from each other.
  // Then Reconciliation + / − and Final SO, and Adj and SOSKU.
  const blockSpan = span + 3 + 2;
  // A date where any session has K3 data has two more columns: K3 Stock and Δ K3.
  const spanOf = (date: string) => blockSpan + (hasK3(date) ? 2 : 0);
  // The cell's content is a fixed-width grid of three lanes — SKU / name,
  // Total stock, hide button. A long product name wraps onto more lines
  // inside its own lane (the row grows taller) instead of running into the
  // stock number.
  const productGrid = "w-64 grid grid-cols-[minmax(0,1fr)_4rem_1rem] gap-x-2";
  const stickyLeft =
    "sticky left-0 shadow-[1px_0_0_var(--color-zinc-700),12px_0_0_var(--color-zinc-950)]";
  const gap = "w-4 min-w-4 p-0 bg-zinc-950";
  // Sub-headers wrap ("Good" / "Stock" / "System") and `w-px` makes each
  // column shrink to its longest word or number instead of the whole label;
  // numbers use the regular font with tabular digits, which is much
  // narrower than monospace.
  const subHeadBase =
    "w-px px-1 py-1 align-bottom font-medium leading-[1.15] bg-zinc-900 border-b border-zinc-700 whitespace-normal break-keep";
  const subHead = `${subHeadBase} text-right`;
  const dataCell =
    "px-1 py-1 text-right tabular-nums bg-zinc-900/30 border-t border-zinc-800/70 group-hover:bg-zinc-900/70";

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
            {bucketLabel(b)}
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
        {data && hiddenIds.length > 0 && (
          <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="h-4 w-4 accent-amber-500" />
            {labels.summary_show_hidden.replace("{n}", String(hiddenIds.length))}
          </label>
        )}
      </div>

      {error !== null && <p className="text-xs text-red-400 mb-3">{error || labels.summary_err_load}</p>}

      {data && (
        <p className="text-xs text-zinc-600 mb-2">
          {loading
            ? labels.summary_loading
            : labels.summary_rows.replace("{n}", rows.length.toLocaleString()).replace("{d}", String(data.dates.length))}
          {!loading && selected?.includes("total") && excludedNames.length > 0 && (
            <span className="ml-3 text-amber-500/80">
              * {labels.summary_total_excludes.replace("{list}", excludedNames.join(", "))}
            </span>
          )}
        </p>
      )}

      {!data ? (
        <p className="text-sm text-zinc-600">{loading ? labels.summary_loading : ""}</p>
      ) : (
        <div ref={scroller} className={`border border-zinc-800 rounded-lg overflow-auto max-h-[70vh] ${loading ? "opacity-60" : ""}`}>
          {/* No min-w-full: stretching the table to the container is what made
              the number columns wide when only a few dates are shown. */}
          <table className="text-[10px] leading-tight border-separate border-spacing-0 whitespace-nowrap">
            <thead className="sticky top-0 z-20">
              <tr className="text-zinc-500 text-left">
                <th rowSpan={2} className={`${stickyLeft} z-30 bg-zinc-900 px-2 py-1 font-medium align-bottom border-b border-zinc-800`}>
                  <div className={`${productGrid} items-end`}>
                    <div className="min-w-0">
                      <SortHeader label={labels.summary_th_sku} sortKey="sku" sort={sort} onSort={(k) => setSort((c) => nextSort(c, k))} />
                      <div className="font-normal text-zinc-600 truncate">{labels.summary_th_product}</div>
                    </div>
                    <div className="text-right whitespace-normal">
                      <SortHeader
                        label={stockLabel}
                        sortKey="stock"
                        sort={sort}
                        onSort={(k) => setSort((c) => nextSort(c, k))}
                        align="right"
                      />
                    </div>
                    <span aria-hidden="true" />
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
                    const { day, weekday } = formatDay(date, locale);
                    const k3Count = k3CountOf(date);
                    const sessionCount = dateSessions.get(date)?.length ?? 0;
                    return (
                      <Fragment key={date}>
                        <th rowSpan={2} className={gap} aria-hidden="true" />
                        <th
                          colSpan={spanOf(date)}
                          className="px-2 py-1 font-semibold text-center text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-t whitespace-nowrap"
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span>
                              {day} <span className="text-zinc-500 font-normal">{weekday}</span>
                            </span>
                            <span className="inline-flex items-center gap-0.5 font-normal">
                              <button
                                type="button"
                                onClick={() => setReportDate(date)}
                                title={labels.report_button_title}
                                className="px-1.5 py-0.5 rounded border border-zinc-600 text-[9px] text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
                              >
                                {labels.report_button}
                              </button>
                              <button
                                type="button"
                                onClick={() => setK3Date(date)}
                                title={k3Count > 0 ? labels.k3_click_replace : labels.k3_import_title}
                                className={`px-1.5 py-0.5 rounded border text-[9px] transition-colors ${
                                  k3Count > 0
                                    ? "border-sky-800 text-sky-300 bg-sky-950/50 hover:bg-sky-900/50"
                                    : "border-zinc-600 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700"
                                }`}
                              >
                                {k3Count > 0
                                  ? labels.k3_button_imported
                                      .replace("{n}", String(k3Count))
                                      .replace("{total}", String(sessionCount))
                                  : `↑ ${labels.k3_import}`}
                              </button>
                            </span>
                          </div>
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
                        <th
                          className={`${subHead} border-l ${i === 0 ? "border-l-zinc-700" : "border-l-zinc-700/60"}`}
                          title={b.key === "total" && excludedNames.length > 0 ? `${b.name} − ${excludedNames.join(", ")}` : undefined}
                        >
                          {b.name}
                          {/* {b.key === "total" && excludedNames.length > 0 && <span className="text-amber-500">*</span>} */}
                          <br />
                          {labels.summary_system}
                        </th>
                        <th
                          className={subHead}
                          title={b.key === "total" && excludedNames.length > 0 ? `${b.name} − ${excludedNames.join(", ")}` : undefined}
                        >
                          {b.name}
                          {/* {b.key === "total" && excludedNames.length > 0 && <span className="text-amber-500">*</span>} */}
                          <br />
                          {labels.summary_so}
                        </th>
                        <th className={subHead}>{labels.summary_delta}</th>
                      </Fragment>
                    ))}
                    <th
                      className={`${subHead} text-emerald-400 border-l border-l-zinc-700`}
                      title={`${labels.report_th_reconciliation} +: ${labels.report_reconcile_plus_title}`}
                    >
                      {labels.summary_th_rec_plus}
                    </th>
                    <th className={`${subHead} text-red-400`} title={`${labels.report_th_reconciliation} −: ${labels.report_reconcile_minus_title}`}>
                      {labels.summary_th_rec_minus}
                    </th>
                    <th className={`${subHead} text-zinc-100`} title={labels.report_final_so_title}>
                      {labels.report_th_final_so}
                    </th>
                    {hasK3(date) && (
                      <>
                        <th className={`${subHead} text-sky-300 border-l border-l-zinc-700`} title={labels.k3_stock_title}>
                          {k3Label}
                        </th>
                        <th
                          className={`${subHead} text-sky-300`}
                          title={excludedNames.length > 0 ? `${k3DeltaTitle} (Total − ${excludedNames.join(", ")})` : k3DeltaTitle}
                        >
                          {k3DeltaLabel}
                          {excludedNames.length > 0 && <span className="text-amber-500">*</span>}
                        </th>
                      </>
                    )}
                    <th className={`${subHeadBase} text-left border-l border-l-zinc-700`}>{adjLabel}</th>
                    <th className={`${subHeadBase} text-left border-x border-l-zinc-700/60 border-r-zinc-700`}>{soskuLabel}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td
                    colSpan={2 + (data.dates.length === 0 ? 2 : data.dates.reduce((n, date) => n + spanOf(date) + 1, 0))}
                    className="px-4 py-6 text-center text-zinc-600"
                  >
                    {labels.summary_no_products}
                  </td>
                </tr>
              </tbody>
            ) : (
              // One <tbody> per product so hovering any of its sub-rows
              // highlights the whole product. A product gets one sub-row per
              // SOSKU session on its busiest day; the SKU / name cell spans
              // them, and each date fills its sessions from the top (oldest
              // first), leaving the rest of its block blank.
              rows.map((item) => {
                const isHidden = hiddenSet.has(item.itemId);
                const perDate = data.dates.map((date) => item.cells[date] ?? []);
                const height = Math.max(1, ...perDate.map((list) => list.length));
                return (
                  <tbody key={item.itemId} className={`group ${isHidden ? "opacity-40" : ""}`}>
                    {Array.from({ length: height }, (_, k) => {
                      // Lines between a product's own sub-rows are fainter
                      // than the line between products.
                      const rowBorder = k === 0 ? "" : "border-t-zinc-800/30";
                      return (
                        <tr key={k}>
                          {k === 0 && (
                            <td
                              rowSpan={height}
                              className={`${stickyLeft} z-10 bg-zinc-950 group-hover:bg-zinc-900 px-2 py-1 border-t border-zinc-800/70`}
                            >
                              <div className={`${productGrid} items-center`}>
                                <div className="min-w-0">
                                  <div className="font-mono text-amber-500 truncate">{item.sku}</div>
                                  <div className="text-zinc-400 whitespace-normal break-words">{item.name}</div>
                                </div>
                                <div
                                  title={stockLabel}
                                  className={`text-right font-mono ${item.currentStock === 0 ? "text-zinc-600" : "text-zinc-200"}`}
                                >
                                  {item.currentStock.toLocaleString()}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleHidden(item.itemId)}
                                  title={isHidden ? labels.summary_unhide : labels.summary_hide}
                                  aria-label={`${isHidden ? labels.summary_unhide : labels.summary_hide} ${item.sku}`}
                                  className={`justify-self-end p-0.5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-opacity ${
                                    isHidden ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  }`}
                                >
                                  {isHidden ? <EyeIcon /> : <EyeOffIcon />}
                                </button>
                              </div>
                            </td>
                          )}
                          {k === 0 && data.dates.length === 0 && (
                            <>
                              <td rowSpan={height} className={gap} aria-hidden="true" />
                              <td rowSpan={height} className="border-t border-zinc-800/70" />
                            </>
                          )}
                          {data.dates.map((date, d) => {
                            const list = perDate[d];
                            const cell = list[k];
                            const gapCell = k === 0 ? <td rowSpan={height} className={gap} aria-hidden="true" /> : null;

                            if (!cell) {
                              // No opname that day: one "—" over the whole block.
                              if (list.length === 0) {
                                return k === 0 ? (
                                  <Fragment key={date}>
                                    {gapCell}
                                    <td
                                      rowSpan={height}
                                      colSpan={spanOf(date)}
                                      className="px-1.5 py-1 text-center text-zinc-700 bg-zinc-900/30 border-t border-x border-zinc-800/70 border-l-zinc-700 border-r-zinc-700 group-hover:bg-zinc-900/70"
                                    >
                                      —
                                    </td>
                                  </Fragment>
                                ) : null;
                              }
                              // Fewer sessions that day than the busiest day:
                              // blank under the last one.
                              return k === list.length ? (
                                <Fragment key={date}>
                                  {gapCell}
                                  <td
                                    rowSpan={height - list.length}
                                    colSpan={spanOf(date)}
                                    className="bg-zinc-900/30 border-t border-x border-zinc-800/30 border-l-zinc-700 border-r-zinc-700 group-hover:bg-zinc-900/70"
                                  />
                                </Fragment>
                              ) : (
                                gapCell && <Fragment key={date}>{gapCell}</Fragment>
                              );
                            }

                            const note = [
                              cell.status === "IN_PROGRESS" ? labels.summary_in_progress : null,
                              `${cell.opnameNumber} · ${cell.lockedAt}${cell.by ? ` · ${cell.by}` : ""}`,
                            ]
                              .filter(Boolean)
                              .join("\n");
                            return (
                              <Fragment key={date}>
                                {gapCell}
                                {buckets.map((b, i) => {
                                  const f = shownFigures(cell, b.key, excludedKeys);
                                  return (
                                    <Fragment key={`${date}-${b.key}`}>
                                      <td
                                        title={note}
                                        className={`${dataCell} ${rowBorder} text-zinc-400 border-l ${i === 0 ? "border-l-zinc-700" : "border-l-zinc-700/60"}`}
                                      >
                                        {i === 0 && cell.status === "IN_PROGRESS" && (
                                          <span className="inline-block w-1 h-1 rounded-full mr-1 align-middle bg-amber-500" />
                                        )}
                                        {f.system.toLocaleString()}
                                      </td>
                                      <td title={note} className={`${dataCell} ${rowBorder} text-zinc-100`}>
                                        {f.counted.toLocaleString()}
                                      </td>
                                      <td title={note} className={`${dataCell} ${rowBorder}`}>
                                        <Delta value={f.counted - f.system} />
                                      </td>
                                    </Fragment>
                                  );
                                })}
                                {(() => {
                                  const target: AdjustTarget = {
                                    itemId: item.itemId,
                                    sku: item.sku,
                                    name: item.name,
                                    date,
                                    opnameNumber: cell.opnameNumber,
                                    current: cell.adjustment,
                                  };
                                  const r = cell.reconciliation;
                                  const totalSo = shownFigures(cell, "total", excludedKeys).counted;
                                  const finalSo = finalSoOf(cell, excludedKeys);
                                  return (
                                    <>
                                      <td className={`${dataCell} ${rowBorder} border-l border-l-zinc-700`}>
                                        <ReconcileInput
                                          compact
                                          value={r?.plus ?? 0}
                                          tone="plus"
                                          title={reconcileTitle(r, labels.report_reconcile_plus_title)}
                                          ariaLabel={`${labels.report_th_reconciliation} ${labels.report_th_reconcile_plus} ${item.sku} ${cell.opnameNumber}`}
                                          onSave={(plus) => saveReconciliation(target, { plus })}
                                        />
                                      </td>
                                      <td className={`${dataCell} ${rowBorder}`}>
                                        <ReconcileInput
                                          compact
                                          value={r?.minus ?? 0}
                                          tone="minus"
                                          title={reconcileTitle(r, labels.report_reconcile_minus_title)}
                                          ariaLabel={`${labels.report_th_reconciliation} ${labels.report_th_reconcile_minus} ${item.sku} ${cell.opnameNumber}`}
                                          onSave={(minus) => saveReconciliation(target, { minus })}
                                        />
                                      </td>
                                      <td
                                        title={`${labels.report_final_so_title}: ${totalSo.toLocaleString()} + ${(r?.plus ?? 0).toLocaleString()} − ${(r?.minus ?? 0).toLocaleString()}`}
                                        className={`${dataCell} ${rowBorder} font-semibold ${r ? "text-violet-200" : "text-zinc-100"}`}
                                      >
                                        {finalSo.toLocaleString()}
                                      </td>
                                    </>
                                  );
                                })()}
                                {hasK3(date) &&
                                  (() => {
                                    const k3 = k3Of(data, item, cell.opnameNumber);
                                    if (!k3) {
                                      // This session has no K3 data.
                                      return (
                                        <>
                                          <td
                                            title={labels.k3_no_import}
                                            className={`${dataCell} ${rowBorder} border-l border-l-zinc-700 text-zinc-700`}
                                          >
                                            —
                                          </td>
                                          <td title={labels.k3_no_import} className={`${dataCell} ${rowBorder} text-zinc-700`}>
                                            —
                                          </td>
                                        </>
                                      );
                                    }
                                    const finalSo = finalSoOf(cell, excludedKeys);
                                    const k3Delta = round3(finalSo - k3.qty);
                                    return (
                                      <>
                                        <td
                                          title={k3.inFile ? labels.k3_stock_title : labels.k3_not_in_file}
                                          className={`${dataCell} ${rowBorder} border-l border-l-zinc-700 ${
                                            k3.inFile ? "text-sky-300" : "text-zinc-600"
                                          }`}
                                        >
                                          {fmtQty(k3.qty)}
                                        </td>
                                        <td
                                          title={`${k3DeltaTitle}: ${fmtQty(finalSo)} − ${fmtQty(k3.qty)}`}
                                          className={`${dataCell} ${rowBorder}`}
                                        >
                                          <Delta value={k3Delta} />
                                        </td>
                                      </>
                                    );
                                  })()}
                                <td className={`${dataCell} ${rowBorder} text-left border-l border-l-zinc-700`}>
                                  <AdjustmentInput
                                    value={cell.adjustment?.note ?? ""}
                                    title={
                                      cell.adjustment
                                        ? `${cell.adjustment.note}${cell.adjustment.at ? ` · ${cell.adjustment.at}` : ""}${
                                            cell.adjustment.by ? ` · ${cell.adjustment.by}` : ""
                                          }`
                                        : labels.summary_mark_adjusted
                                    }
                                    ariaLabel={`${adjLabel} ${item.sku} ${cell.opnameNumber}`}
                                    onSave={(code) =>
                                      saveAdjustment(
                                        {
                                          itemId: item.itemId,
                                          sku: item.sku,
                                          name: item.name,
                                          date,
                                          opnameNumber: cell.opnameNumber,
                                          current: cell.adjustment,
                                        },
                                        code
                                      )
                                    }
                                  />
                                </td>
                                <td className={`${dataCell} ${rowBorder} text-left border-x border-l-zinc-700/60 border-r-zinc-700`}>
                                  <button
                                    type="button"
                                    onClick={() => setDetail({ itemId: item.itemId, date, opnameNumber: cell.opnameNumber })}
                                    title={note}
                                    className="font-mono text-amber-500 hover:text-amber-300 hover:underline"
                                  >
                                    {shortOpname(cell.opnameNumber)}
                                  </button>
                                </td>
                              </Fragment>
                            );
                          })}
                          {k === 0 && <td rowSpan={height} className={gap} aria-hidden="true" />}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })
            )}
          </table>
        </div>
      )}

      {k3Date !== null && data && (
        <K3ImportDialog
          date={k3Date}
          data={data}
          sessions={dateSessions.get(k3Date) ?? []}
          labels={labels}
          locale={locale}
          onImported={() => setReloadKey((k) => k + 1)}
          onClose={() => setK3Date(null)}
        />
      )}

      {reportDate !== null && data && (
        <DateReportModal
          date={reportDate}
          data={data}
          rows={rows}
          buckets={buckets}
          excludedKeys={excludedKeys}
          excludedNames={excludedNames}
          labels={labels}
          locale={locale}
          onSaveNote={saveAdjustment}
          onSaveReconciliation={saveReconciliation}
          allBuckets={data.buckets}
          selectedKeys={selected ?? []}
          onToggleBucket={toggleBucket}
          bucketLabel={bucketLabel}
          onClose={() => setReportDate(null)}
        />
      )}

      {detail !== null && data && (
        <OpnameHistoryModal
          itemId={detail.itemId}
          date={detail.date}
          opnameNumber={detail.opnameNumber}
          warehouseId={data.warehouse.id}
          bucketKeys={selected ?? []}
          labels={labels}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
