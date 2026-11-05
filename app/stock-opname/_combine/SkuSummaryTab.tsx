"use client";

import { Fragment, useState } from "react";
import { fmtQty } from "../_summary/format";
import type { CombineResponse, SkuStatus, SkuSummaryRow } from "./types";
import { K3Bar } from "./K3Bar";
import { SummaryStat } from "./SummaryStat";

// Second tab of the Combine CSO report: every SKU's System / SO quantity per
// location group, and K3 once a file is imported. Same idea as the Stock Opname
// Summary's columns: untick a location and it leaves the table, the Total, the
// Difference, the Status and Δ K3.

const STATUS_STYLES: Record<SkuStatus, string> = {
  MATCH: "bg-emerald-950 text-emerald-300",
  MISMATCH: "bg-amber-950 text-amber-300",
  UNDER_REVIEW: "bg-purple-950 text-purple-300",
};

const STATUS_LABELS: Record<SkuStatus, string> = {
  MATCH: "Match",
  MISMATCH: "Mismatch",
  UNDER_REVIEW: "Under Review",
};

export function SkuSummaryTab({
  result,
  rows,
  excludedColumns,
  onToggleColumn,
  onK3Changed,
}: {
  result: CombineResponse;
  rows: SkuSummaryRow[];
  excludedColumns: string[];
  onToggleColumn: (key: string) => void;
  onK3Changed: () => void;
}) {
  const [filter, setFilter] = useState<"ALL" | SkuStatus>("ALL");
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);
  const countOf = (status: SkuStatus) => rows.filter((r) => r.status === status).length;

  const columns = result.columns.filter((c) => !excludedColumns.includes(c.key));
  const excludedLabels = result.columns.filter((c) => excludedColumns.includes(c.key)).map((c) => c.label);
  const hasK3 = result.k3 !== null;
  const columnCount = 3 + columns.length * 2 + 3 + (hasK3 ? 2 : 0);

  const groupHead = "sticky top-0 bg-zinc-900 px-3 py-1.5 font-medium text-center border-l border-zinc-800 whitespace-nowrap";
  const subHead = "sticky top-[1.875rem] bg-zinc-900 px-3 py-1.5 font-medium text-right whitespace-nowrap";
  const num = "px-3 py-1.5 text-right font-mono whitespace-nowrap";

  return (
    <div>
      <div className="flex gap-6 mb-5 flex-wrap">
        <SummaryStat label="Sessions" value={result.sessionCount} />
        <SummaryStat label="SKUs" value={rows.length} />
        <SummaryStat label="Match" value={countOf("MATCH")} accent="text-emerald-400" />
        <SummaryStat label="Mismatch" value={countOf("MISMATCH")} accent="text-amber-400" />
        {countOf("UNDER_REVIEW") > 0 && (
          <SummaryStat label="Under Review" value={countOf("UNDER_REVIEW")} accent="text-purple-400" />
        )}
        <SummaryStat label="Combined Qty" value={rows.reduce((sum, r) => sum + r.totalSo, 0)} />
        <SummaryStat label="System Qty" value={rows.reduce((sum, r) => sum + r.totalSystem, 0)} />
        {result.emptyConfirmations > 0 && (
          <SummaryStat label="Empty Confirmations" value={result.emptyConfirmations} accent="text-zinc-500" />
        )}
      </div>

      <K3Bar opnameNumbers={result.opnameNumbers} k3={result.k3} onChanged={onK3Changed} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-sm">
        <span className="text-xs text-zinc-500">Locations:</span>
        {result.columns.map((c) => (
          <label key={c.key} className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!excludedColumns.includes(c.key)}
              onChange={() => onToggleColumn(c.key)}
              className="h-4 w-4 accent-amber-500"
            />
            {c.label}
          </label>
        ))}
        {excludedLabels.length > 0 && (
          <span className="text-xs text-amber-500/80">* Total excludes: {excludedLabels.join(", ")}</span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        {(["ALL", "UNDER_REVIEW", "MISMATCH", "MATCH"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${
              filter === s ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {s === "ALL" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-auto max-h-[70vh]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left">
              <th rowSpan={2} className="sticky top-0 z-10 bg-zinc-900 px-3 py-1.5 font-medium align-bottom">SKU</th>
              <th rowSpan={2} className="sticky top-0 z-10 bg-zinc-900 px-3 py-1.5 font-medium align-bottom">Product</th>
              {columns.map((c) => (
                <th key={c.key} colSpan={2} className={groupHead}>
                  {c.label}
                </th>
              ))}
              <th colSpan={3} className={groupHead}>
                Total{excludedLabels.length > 0 && <span className="text-amber-500">*</span>}
              </th>
              {hasK3 && <th colSpan={2} className={`${groupHead} text-sky-300`}>K3 Good Stock</th>}
              <th rowSpan={2} className="sticky top-0 z-10 bg-zinc-900 px-3 py-1.5 font-medium align-bottom border-l border-zinc-800">
                Status
              </th>
            </tr>
            <tr className="text-zinc-500">
              {columns.map((c) => (
                <Fragment key={c.key}>
                  <th className={`${subHead} border-l border-zinc-800`}>System</th>
                  <th className={subHead}>SO</th>
                </Fragment>
              ))}
              <th className={`${subHead} border-l border-zinc-800`}>System</th>
              <th className={subHead}>SO</th>
              <th className={subHead}>Difference</th>
              {hasK3 && (
                <>
                  <th className={`${subHead} border-l border-zinc-800 text-sky-300`}>K3</th>
                  <th className={`${subHead} text-sky-300`} title="Total SO (ticked locations) − K3 Good Stock">
                    Δ K3{excludedLabels.length > 0 && <span className="text-amber-500">*</span>}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-6 text-center text-zinc-600">
                  No rows in this category.
                </td>
              </tr>
            ) : (
              shown.map((row) => (
                <tr key={row.itemId} className="border-t border-zinc-800/60 hover:bg-zinc-900/50 transition-colors">
                  <td className="px-3 py-1.5 font-mono text-zinc-300 whitespace-nowrap">{row.sku}</td>
                  <td className="px-3 py-1.5 text-zinc-500">{row.name}</td>
                  {columns.map((c) => {
                    const system = row.system[c.key] ?? 0;
                    const so = row.so[c.key] ?? 0;
                    return (
                      <Fragment key={c.key}>
                        <td className={`${num} text-zinc-400 border-l border-zinc-800/60`}>{system.toLocaleString()}</td>
                        <td className={`${num} ${so === system ? "text-zinc-200" : "text-amber-400"}`}>{so.toLocaleString()}</td>
                      </Fragment>
                    );
                  })}
                  <td className={`${num} text-zinc-400 border-l border-zinc-800/60`}>{row.totalSystem.toLocaleString()}</td>
                  <td className={`${num} text-zinc-200`}>{row.totalSo.toLocaleString()}</td>
                  <td className={num}>
                    <SignedQty value={row.difference} />
                  </td>
                  {hasK3 && (
                    <>
                      <td
                        className={`${num} border-l border-zinc-800/60 ${row.k3InFile ? "text-sky-300" : "text-zinc-600"}`}
                        title={row.k3InFile ? undefined : "Not in the K3 file (0)"}
                      >
                        {fmtQty(row.k3 ?? 0)}
                      </td>
                      <td className={num}>
                        <SignedQty value={row.k3Delta ?? 0} />
                      </td>
                    </>
                  )}
                  <td className="px-3 py-1.5 whitespace-nowrap border-l border-zinc-800/60">
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLES[row.status]}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignedQty({ value }: { value: number }) {
  if (value === 0) return <span className="text-emerald-400">0</span>;
  return (
    <span className={value > 0 ? "text-amber-400" : "text-red-400"}>
      {value > 0 ? "+" : ""}
      {fmtQty(value)}
    </span>
  );
}
