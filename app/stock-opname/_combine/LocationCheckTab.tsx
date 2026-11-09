"use client";

import { useState } from "react";
import type { CombineResponse, LocationStatus, ReportRow, Selections } from "./types";
import { LOCATION_STATUS_LABELS, whoLabel } from "./calc";
import { SummaryStat } from "./SummaryStat";

// First tab of the Combine CSO report: every rack, and every other location
// the selected sessions counted, with the system's SKU + quantity next to the
// counted SKU + quantity and who counted it.

const STATUS_STYLES: Record<LocationStatus, string> = {
  MATCH: "bg-emerald-950 text-emerald-300",
  QTY_MISMATCH: "bg-amber-950 text-amber-300",
  SKU_MISMATCH: "bg-red-950 text-red-300",
  UNDER_REVIEW: "bg-purple-950 text-purple-300",
  NOT_OPNAMED: "bg-zinc-800 text-zinc-400",
};

const FILTERS: LocationStatus[] = ["UNDER_REVIEW", "SKU_MISMATCH", "QTY_MISMATCH", "NOT_OPNAMED", "MATCH"];

export function LocationCheckTab({
  result,
  rows,
  selections,
  onChoose,
}: {
  result: CombineResponse;
  rows: ReportRow[];
  selections: Selections;
  onChoose: (key: string, opnameNumber: string) => void;
}) {
  const [filter, setFilter] = useState<"ALL" | LocationStatus>("ALL");
  // " pk" after a quantity in a packs location's column (loose packs).
  const packsColumns = new Set(result.columns.filter((c) => c.packs).map((c) => c.key));
  const packsUnit = (column: string) => (packsColumns.has(column) ? " pk" : "");

  const countOf = (status: LocationStatus) => rows.filter((r) => r.status === status).length;
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);

  const th = "sticky top-0 bg-zinc-900 px-3 py-2 font-medium whitespace-nowrap";

  return (
    <div>
      <div className="border border-zinc-800 rounded-lg px-4 py-3 mb-5">
        <div className="text-xs text-zinc-500 mb-2">Rack Locations</div>
        <div className="flex gap-6 flex-wrap">
          <SummaryStat label="Total Racks" value={result.rackCoverage.total} />
          <SummaryStat label="Opnamed" value={result.rackCoverage.opnamed} accent="text-emerald-400" />
          <SummaryStat label="Not Opnamed" value={result.rackCoverage.notOpnamed} accent="text-amber-400" />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <FilterChip label={`All (${rows.length.toLocaleString()})`} active={filter === "ALL"} onClick={() => setFilter("ALL")} />
        {FILTERS.map((s) => (
          <FilterChip
            key={s}
            label={`${LOCATION_STATUS_LABELS[s]} (${countOf(s).toLocaleString()})`}
            active={filter === s}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-auto max-h-[70vh]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left">
              <th className={th}>Location</th>
              <th className={th}>System SKU</th>
              <th className={th}>Product Name</th>
              <th className={`${th} text-right`}>System Qty</th>
              <th className={th}>SO SKU</th>
              <th className={th}>PD Name</th>
              <th className={`${th} text-right`}>SO Qty</th>
              <th className={th}>CSO By</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-zinc-600">
                  No rows in this category.
                </td>
              </tr>
            ) : (
              shown.map((row) => (
                <tr key={row.key} className="border-t border-zinc-800/60 hover:bg-zinc-900/50 transition-colors align-top">
                  <td className="px-3 py-1.5 font-mono text-zinc-300 whitespace-nowrap">{row.locationCode}</td>
                  <td className="px-3 py-1.5 font-mono text-zinc-300 whitespace-nowrap">{row.system?.sku ?? "—"}</td>
                  <td className="px-3 py-1.5 text-zinc-500">{row.system?.name ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                    {row.system ? `${row.system.qty.toLocaleString()}${packsUnit(row.column)}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-zinc-300 whitespace-nowrap">
                    {row.so?.sku ?? (row.emptyConfirmed ? <span className="font-sans text-zinc-500 italic">Empty</span> : "—")}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-500">{row.so?.name ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {row.so?.qty != null
                      ? `${row.so.qty.toLocaleString()}${packsUnit(row.column)}`
                      : row.emptyConfirmed
                        ? "0"
                        : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <CsoByCell row={row} selections={selections} onChoose={onChoose} />
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLES[row.status]}`}>
                      {LOCATION_STATUS_LABELS[row.status]}
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

// Who counted this row, or the sessions to choose between where they differ.
function CsoByCell({
  row,
  selections,
  onChoose,
}: {
  row: ReportRow;
  selections: Selections;
  onChoose: (key: string, opnameNumber: string) => void;
}) {
  const { choice } = row;
  if (!choice) {
    if (row.by.length === 0) return <span className="text-zinc-600">—</span>;
    return (
      <div className="space-y-0.5 whitespace-nowrap text-zinc-300">
        {row.by.map((b) => (
          <div key={b.opnameNumber}>{whoLabel(b)}</div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {choice.options.map((option) => (
        <label key={option.opnameNumber} className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
          <input
            type="radio"
            name={`choice-${choice.key}`}
            checked={selections[choice.key] === option.opnameNumber}
            onChange={() => onChoose(choice.key, option.opnameNumber)}
          />
          <span className="text-zinc-300">{whoLabel(option)}</span>
          <span className="font-mono text-amber-500">{option.detail}</span>
        </label>
      ))}
      {!selections[choice.key] && <div className="text-[10px] text-purple-400">Pick which session to use</div>}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${
        active ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}
