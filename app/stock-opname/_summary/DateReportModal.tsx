"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { Bucket, Status, AdjustTarget, SummaryResponse, ReportFilterKey } from "./types";
import { shownFigures, finalSoOf, round3, k3Of, sessionsByDate } from "./calc";
import { formatDay, fmtQty, sheetName } from "./format";
import { Delta } from "./Delta";
import { ColumnFilter } from "./ColumnFilter";
import { AdjustmentInput } from "./AdjustmentInput";
import { reconcileTitle, ReconcileInput } from "./ReconcileInput";

// The Report button of a date: every SOSKU session that day (with the page's
// search, hidden products, filters and column choices applied) in a window
// 90% of the screen, so full product names and adjustment notes fit. Notes
// can be written here too; totals at the bottom; Excel export of the report.
export function DateReportModal({
  date,
  data,
  rows,
  buckets,
  excludedKeys,
  excludedNames,
  labels,
  locale,
  onSaveNote,
  onSaveReconciliation,
  allBuckets,
  selectedKeys,
  onToggleBucket,
  bucketLabel,
  onClose,
}: {
  date: string;
  data: SummaryResponse;
  rows: SummaryResponse["items"];
  buckets: Bucket[];
  excludedKeys: string[];
  excludedNames: string[];
  labels: Record<string, string>;
  locale: string;
  onSaveNote: (target: AdjustTarget, note: string) => Promise<{ error?: string }>;
  onSaveReconciliation: (target: AdjustTarget, change: { plus?: number; minus?: number }) => Promise<{ error?: string }>;
  // The page's column checkboxes, also offered in the report (same choice).
  allBuckets: Bucket[];
  selectedKeys: string[];
  onToggleBucket: (key: string) => void;
  bucketLabel: (b: Bucket) => string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // K3 columns when any of the date's sessions has K3 data; per line only
  // for sessions that have it.
  const daySessions = sessionsByDate(data).get(date) ?? [];
  const k3Sessions = daySessions.filter((s) => data.k3Sessions?.[s.opnameNumber] !== undefined).length;
  const k3 = k3Sessions > 0;
  const { day, weekday } = formatDay(date, locale);
  const statusLabel = (st: Status) =>
    st === "CONFIRMED" ? labels.status_confirmed : st === "DONE" ? labels.status_done : labels.status_in_progress;

  // One line per SOSKU session that day, with everything the table shows.
  const allLines = rows.flatMap((item) =>
    (item.cells[date] ?? []).map((cell) => {
      const figs = buckets.map((b) => shownFigures(cell, b.key, excludedKeys));
      const totalSo = shownFigures(cell, "total", excludedKeys).counted;
      // Reconciliation: + and − on the Total SO give the Final SO, which K3
      // is compared with (Δ K3 = Final SO − K3).
      const plus = cell.reconciliation?.plus ?? 0;
      const minus = cell.reconciliation?.minus ?? 0;
      const finalSo = finalSoOf(cell, excludedKeys);
      const k3Line = k3Of(data, item, cell.opnameNumber);
      const k3Qty = k3Line ? k3Line.qty : null;
      const k3Delta = k3Qty === null ? null : round3(finalSo - k3Qty);
      const hasDiff = figs.some((f) => f.counted !== f.system) || (k3Delta !== null && k3Delta !== 0);
      return { item, cell, figs, k3Qty, k3Delta, k3InFile: k3Line?.inFile ?? false, hasDiff, totalSo, plus, minus, finalSo };
    })
  );

  // Column filters (SKU, Product Name, Status, SOSKU): the values each
  // one has unticked. Empty = everything shown, so new values show by default.
  const [hidden, setHidden] = useState<Record<ReportFilterKey, string[]>>({ sku: [], product: [], status: [], sosku: [] });
  // A click on the dark backdrop closes the report — unless a filter list was
  // open, in which case that click only closes the list.
  const filterOpen = useRef(false);
  const backdropCloses = useRef(false);
  const onFilterOpenChange = useCallback((isOpen: boolean) => {
    filterOpen.current = isOpen;
  }, []);
  const valueOf: Record<ReportFilterKey, (l: (typeof allLines)[number]) => string> = {
    sku: (l) => l.item.sku,
    product: (l) => l.item.name,
    status: (l) => statusLabel(l.cell.status),
    sosku: (l) => l.cell.opnameNumber,
  };
  const filterKeys = Object.keys(hidden) as ReportFilterKey[];
  const optionsOf = (key: ReportFilterKey) => {
    const counts = new Map<string, number>();
    for (const l of allLines) counts.set(valueOf[key](l), (counts.get(valueOf[key](l)) ?? 0) + 1);
    return [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
  };
  const filtered = filterKeys.some((k) => hidden[k].length > 0);
  const shownLines = allLines.filter((l) => filterKeys.every((k) => !hidden[k].includes(valueOf[k](l))));

  // A product opnamed more than once that day: only its latest shown session
  // (a recount) goes into the totals, so nothing is counted twice.
  const lastShown = new Map<number, (typeof allLines)[number]>();
  for (const l of shownLines) lastShown.set(l.item.itemId, l);
  const lines = shownLines.map((l) => ({ ...l, latest: lastShown.get(l.item.itemId) === l }));
  const totalLines = lines.filter((l) => l.latest);
  const totals = buckets.map((_, i) =>
    totalLines.reduce(
      (t, l) => ({ system: t.system + l.figs[i].system, counted: t.counted + l.figs[i].counted }),
      { system: 0, counted: 0 }
    )
  );
  const targetOf = (l: (typeof allLines)[number]): AdjustTarget => ({
    itemId: l.item.itemId,
    sku: l.item.sku,
    name: l.item.name,
    date,
    opnameNumber: l.cell.opnameNumber,
    current: l.cell.adjustment,
  });
  const plusTotal = totalLines.reduce((n, l) => n + l.plus, 0);
  const minusTotal = totalLines.reduce((n, l) => n + l.minus, 0);
  const finalSoTotal = totalLines.reduce((n, l) => n + l.finalSo, 0);
  const k3Total = round3(totalLines.reduce((n, l) => n + (l.k3Qty ?? 0), 0));
  const k3DeltaTotal = round3(totalLines.reduce((n, l) => n + (l.k3Delta ?? 0), 0));
  const skuCount = new Set(lines.map((l) => l.item.itemId)).size;
  const diffCount = lines.filter((l) => l.hasDiff).length;
  const notedCount = lines.filter((l) => l.cell.adjustment).length;

  function exportReport() {
    const header: (string | number)[] = ["#", labels.summary_th_sku, labels.summary_th_product];
    for (const b of buckets) header.push(`${b.name} ${labels.summary_system}`, `${b.name} ${labels.summary_so}`, labels.summary_delta);
    header.push(
      `${labels.report_th_reconciliation} ${labels.report_th_reconcile_plus}`,
      `${labels.report_th_reconciliation} ${labels.report_th_reconcile_minus}`,
      labels.report_th_final_so
    );
    if (k3) header.push(labels.summary_th_k3, labels.summary_th_k3_delta);
    header.push(labels.detail_th_status, labels.summary_th_sosku, labels.report_th_pic, labels.detail_th_date, labels.report_th_note);
    const body = lines.map((l, i) => {
      const r: (string | number)[] = [i + 1, l.item.sku, l.item.name];
      for (const f of l.figs) r.push(f.system, f.counted, f.counted - f.system);
      r.push(l.plus, l.minus, l.finalSo);
      if (k3) r.push(l.k3Qty ?? "", l.k3Delta ?? "");
      r.push(statusLabel(l.cell.status), l.cell.opnameNumber, l.cell.by ?? "", l.cell.lockedAt, l.cell.adjustment?.note ?? "");
      return r;
    });
    const totalRow: (string | number)[] = ["", labels.report_totals, ""];
    for (const tt of totals) totalRow.push(tt.system, tt.counted, tt.counted - tt.system);
    totalRow.push(plusTotal, minusTotal, finalSoTotal);
    if (k3) totalRow.push(k3Total, k3DeltaTotal);
    const title = [`${labels.report_title} — ${day} ${weekday} — ${data.warehouse.name}`];
    const sheet = XLSX.utils.aoa_to_sheet([title, [], header, ...body, totalRow]);
    sheet["!cols"] = header.map((h) =>
      h === labels.summary_th_product ? { wch: 45 } : h === labels.report_th_note ? { wch: 60 } : { wch: 14 }
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, sheetName(labels.report_title));
    XLSX.writeFile(book, `stock-opname-report-${date}.xlsx`, { bookType: "xlsx" });
  }

  // Base cell styles, then text-left / text-right added per column (never
  // both, or the stylesheet's order decides which one wins).
  const thBase = "px-2 py-1.5 font-medium align-bottom border-b border-zinc-700 bg-zinc-900 break-keep";
    const tdBase = "px-2 py-1.5 tabular-nums border-t border-zinc-800/70 align-top";
  const th = `${thBase} text-right`;
  const td = `${tdBase} text-right`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onMouseDown={(e) => {
        backdropCloses.current = e.target === e.currentTarget && !filterOpen.current;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropCloses.current) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[90vw] h-[90vh] bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {labels.report_title}{" "}
              <span className="text-zinc-400 font-normal">
                · {day} {weekday} · {data.warehouse.name}
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>
                {labels.report_count.replace("{lines}", lines.length.toLocaleString()).replace("{skus}", skuCount.toLocaleString())}
              </span>
              {filtered && (
                <span className="text-amber-400">
                  {labels.report_filtered
                    .replace("{shown}", lines.length.toLocaleString())
                    .replace("{total}", allLines.length.toLocaleString())}{" "}
                  <button
                    type="button"
                    onClick={() => setHidden({ sku: [], product: [], status: [], sosku: [] })}
                    className="underline hover:text-amber-200"
                  >
                    {labels.report_filter_reset}
                  </button>
                </span>
              )}
              <span className={diffCount > 0 ? "text-amber-400" : ""}>
                {labels.report_with_diff.replace("{n}", diffCount.toLocaleString())}
              </span>
              <span className={notedCount > 0 ? "text-emerald-400" : ""}>
                {labels.report_noted.replace("{n}", notedCount.toLocaleString())}
              </span>
              {k3 && (
                <span className="text-sky-300">
                  {labels.report_k3_info
                    .replace("{n}", String(k3Sessions))
                    .replace("{total}", String(daySessions.length))}
                </span>
              )}
              {excludedNames.length > 0 && (
                <span className="text-amber-500/80">
                  * {labels.summary_total_excludes.replace("{list}", excludedNames.join(", "))}
                </span>
              )}
            </p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{labels.report_filters_note}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
              <span className="text-zinc-500">{labels.summary_columns}:</span>
              {allBuckets.map((b) => (
                <label key={b.key} className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(b.key)}
                    onChange={() => onToggleBucket(b.key)}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  {bucketLabel(b)}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportReport}
              disabled={lines.length === 0}
              className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
            >
              {labels.summary_export}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100"
            >
              {labels.detail_close}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {allLines.length === 0 ? (
            <p className="p-6 text-sm text-zinc-600">{labels.report_empty}</p>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="text-zinc-400">
                  <th rowSpan={2} className={`${thBase} text-left w-8`}>#</th>
                  <th rowSpan={2} className={`${thBase} text-left`}>
                    <ColumnFilter
                      label={labels.summary_th_sku}
                      options={optionsOf("sku")}
                      hidden={hidden.sku}
                      onChange={(next) => setHidden((h) => ({ ...h, sku: next }))}
                      onOpenChange={onFilterOpenChange}
                      labels={labels}
                    />
                  </th>
                  <th rowSpan={2} className={`${thBase} text-left min-w-[11rem]`}>
                    <ColumnFilter
                      label={labels.summary_th_product}
                      options={optionsOf("product")}
                      hidden={hidden.product}
                      onChange={(next) => setHidden((h) => ({ ...h, product: next }))}
                      onOpenChange={onFilterOpenChange}
                      labels={labels}
                    />
                  </th>
                  {buckets.map((b) => (
                    <Fragment key={b.key}>
                      <th rowSpan={2} className={`${th} border-l border-l-zinc-800`}>
                        {b.name}
                        {b.key === "total" && excludedNames.length > 0 && <span className="text-amber-500">*</span>}
                        <br />
                        {labels.summary_system}
                      </th>
                      <th rowSpan={2} className={th}>
                        {b.name}
                        {b.key === "total" && excludedNames.length > 0 && <span className="text-amber-500">*</span>}
                        <br />
                        {labels.summary_so}
                      </th>
                      <th rowSpan={2} className={th}>{labels.summary_delta}</th>
                    </Fragment>
                  ))}
                  <th colSpan={2} className={`${thBase} text-center text-violet-300 border-l border-l-zinc-800 pb-0.5`}>
                    {labels.report_th_reconciliation}
                  </th>
                  <th rowSpan={2} className={`${th} text-zinc-100`} title={labels.report_final_so_title}>
                    {labels.report_th_final_so}
                  </th>
                  {k3 && (
                    <>
                      <th rowSpan={2} className={`${th} text-sky-300 border-l border-l-zinc-800`}>{labels.summary_th_k3}</th>
                      <th rowSpan={2} className={`${th} text-sky-300`} title={labels.summary_k3_delta_title}>
                        {labels.summary_th_k3_delta}
                      </th>
                    </>
                  )}
                  <th rowSpan={2} className={`${thBase} text-left border-l border-l-zinc-800`}>
                    <ColumnFilter
                      label={labels.detail_th_status}
                      options={optionsOf("status")}
                      hidden={hidden.status}
                      onChange={(next) => setHidden((h) => ({ ...h, status: next }))}
                      onOpenChange={onFilterOpenChange}
                      labels={labels}
                    />
                  </th>
                  <th rowSpan={2} className={`${thBase} text-left`}>
                    <ColumnFilter
                      label={labels.summary_th_sosku}
                      options={optionsOf("sosku")}
                      hidden={hidden.sosku}
                      onChange={(next) => setHidden((h) => ({ ...h, sosku: next }))}
                      onOpenChange={onFilterOpenChange}
                      labels={labels}
                    />
                    <div className="font-normal text-zinc-500">
                      {labels.report_th_pic} · {labels.detail_th_date}
                    </div>
                  </th>
                  <th rowSpan={2} className={`${thBase} text-left min-w-[14rem]`}>{labels.report_th_note}</th>
                </tr>
                <tr className="text-zinc-400">
                  <th className={`${th} border-l border-l-zinc-800 text-emerald-400 pt-0.5`} title={labels.report_reconcile_plus_title}>
                    {labels.report_th_reconcile_plus}
                  </th>
                  <th className={`${th} text-red-400 pt-0.5`} title={labels.report_reconcile_minus_title}>
                    {labels.report_th_reconcile_minus}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={99} className="px-4 py-8 text-center text-sm text-zinc-600">
                      {labels.report_empty_filtered}
                    </td>
                  </tr>
                )}
                {lines.map((l, i) => (
                  <tr
                    key={`${l.item.itemId}-${l.cell.opnameNumber}`}
                    className={`hover:bg-zinc-900/60 ${l.latest ? "" : "text-zinc-500 [&_td]:opacity-60"}`}
                    title={l.latest ? undefined : labels.report_not_in_totals}
                  >
                    <td className={`${tdBase} text-left text-zinc-600`}>{i + 1}</td>
                    <td className={`${tdBase} text-left font-mono text-amber-500 whitespace-nowrap`}>{l.item.sku}</td>
                    <td className={`${tdBase} text-left text-zinc-300 whitespace-normal break-words`}>{l.item.name}</td>
                    {l.figs.map((f, j) => (
                      <Fragment key={buckets[j].key}>
                        <td className={`${td} text-zinc-400 border-l border-l-zinc-800`}>{f.system.toLocaleString()}</td>
                        <td className={`${td} text-zinc-100`}>{f.counted.toLocaleString()}</td>
                        <td className={td}>
                          <Delta value={f.counted - f.system} />
                        </td>
                      </Fragment>
                    ))}
                    <td className={`${td} border-l border-l-zinc-800`}>
                      <ReconcileInput
                        value={l.plus}
                        tone="plus"
                        title={reconcileTitle(l.cell.reconciliation, labels.report_reconcile_plus_title)}
                        ariaLabel={`${labels.report_th_reconciliation} ${labels.report_th_reconcile_plus} ${l.item.sku} ${l.cell.opnameNumber}`}
                        onSave={(plus) => onSaveReconciliation(targetOf(l), { plus })}
                      />
                    </td>
                    <td className={td}>
                      <ReconcileInput
                        value={l.minus}
                        tone="minus"
                        title={reconcileTitle(l.cell.reconciliation, labels.report_reconcile_minus_title)}
                        ariaLabel={`${labels.report_th_reconciliation} ${labels.report_th_reconcile_minus} ${l.item.sku} ${l.cell.opnameNumber}`}
                        onSave={(minus) => onSaveReconciliation(targetOf(l), { minus })}
                      />
                    </td>
                    <td
                      className={`${td} font-semibold ${l.plus !== 0 || l.minus !== 0 ? "text-violet-200" : "text-zinc-100"}`}
                      title={`${labels.report_final_so_title}: ${l.totalSo.toLocaleString()} + ${l.plus.toLocaleString()} − ${l.minus.toLocaleString()}`}
                    >
                      {l.finalSo.toLocaleString()}
                    </td>
                    {k3 &&
                      (l.k3Qty === null ? (
                        <>
                          <td className={`${td} border-l border-l-zinc-800 text-zinc-700`} title={labels.k3_no_import}>
                            —
                          </td>
                          <td className={`${td} text-zinc-700`} title={labels.k3_no_import}>
                            —
                          </td>
                        </>
                      ) : (
                        <>
                          <td
                            className={`${td} border-l border-l-zinc-800 ${l.k3InFile ? "text-sky-300" : "text-zinc-600"}`}
                            title={l.k3InFile ? labels.k3_stock_title : labels.k3_not_in_file}
                          >
                            {fmtQty(l.k3Qty)}
                          </td>
                          <td className={td}>
                            <Delta value={l.k3Delta ?? 0} />
                          </td>
                        </>
                      ))}
                    <td className={`${tdBase} text-left whitespace-nowrap border-l border-l-zinc-800`}>
                      <span
                        className={
                          l.cell.status === "IN_PROGRESS" ? "text-amber-400" : l.cell.status === "CONFIRMED" ? "text-sky-400" : "text-emerald-400"
                        }
                      >
                        {statusLabel(l.cell.status)}
                      </span>
                    </td>
                    <td className={`${tdBase} text-left whitespace-nowrap`}>
                      <div className="font-mono text-amber-500">{l.cell.opnameNumber}</div>
                      <div className="text-[10px] text-zinc-500">
                        {l.cell.by ?? "—"} · <span className="font-mono">{l.cell.lockedAt}</span>
                      </div>
                    </td>
                    <td className={`${tdBase} text-left`}>
                      <AdjustmentInput
                        multiline
                        value={l.cell.adjustment?.note ?? ""}
                        placeholder={labels.report_note_placeholder}
                        title={
                          l.cell.adjustment
                            ? `${l.cell.adjustment.at ?? ""}${l.cell.adjustment.by ? ` · ${l.cell.adjustment.by}` : ""}`
                            : labels.summary_mark_adjusted
                        }
                        ariaLabel={`${labels.report_th_note} ${l.item.sku} ${l.cell.opnameNumber}`}
                        onSave={(note) =>
                          onSaveNote(
                            {
                              itemId: l.item.itemId,
                              sku: l.item.sku,
                              name: l.item.name,
                              date,
                              opnameNumber: l.cell.opnameNumber,
                              current: l.cell.adjustment,
                            },
                            note
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="text-zinc-200 font-medium">
                  <td className={`${td} bg-zinc-900 border-t-zinc-700`} />
                  <td className={`${td} bg-zinc-900 border-t-zinc-700 text-left`} colSpan={2}>
                    {labels.report_totals}
                  </td>
                  {totals.map((tt, j) => (
                    <Fragment key={buckets[j].key}>
                      <td className={`${td} bg-zinc-900 border-t-zinc-700 border-l border-l-zinc-800 text-zinc-400`}>
                        {tt.system.toLocaleString()}
                      </td>
                      <td className={`${td} bg-zinc-900 border-t-zinc-700`}>{tt.counted.toLocaleString()}</td>
                      <td className={`${td} bg-zinc-900 border-t-zinc-700`}>
                        <Delta value={tt.counted - tt.system} />
                      </td>
                    </Fragment>
                  ))}
                  <td className={`${td} bg-zinc-900 border-t-zinc-700 border-l border-l-zinc-800 text-emerald-400`}>
                    {plusTotal.toLocaleString()}
                  </td>
                  <td className={`${td} bg-zinc-900 border-t-zinc-700 text-red-400`}>{minusTotal.toLocaleString()}</td>
                  <td className={`${td} bg-zinc-900 border-t-zinc-700 font-semibold`}>{finalSoTotal.toLocaleString()}</td>
                  {k3 && (
                    <>
                      <td className={`${td} bg-zinc-900 border-t-zinc-700 border-l border-l-zinc-800 text-sky-300`}>{fmtQty(k3Total)}</td>
                      <td className={`${td} bg-zinc-900 border-t-zinc-700`}>
                        <Delta value={k3DeltaTotal} />
                      </td>
                    </>
                  )}
                  <td className={`${td} bg-zinc-900 border-t-zinc-700 border-l border-l-zinc-800`} colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
