"use client";

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";

type CsoSession = {
  opnameNumber: string;
  notes: string | null;
  completedAt: string | null;
  totalLines: number;
  countedLines: number;
};

type CountedEntry = {
  opnameNumber: string;
  countedQty: number;
  countedAt: string | null;
  countedByUsername: string | null;
};

type LocationBreakdownRow = {
  locationCode: string;
  systemQty: number | null;
  entries: CountedEntry[];
  resolvedQty: number | null; // null when entries disagree and nothing's been picked server-side
  conflict: boolean;
};

type ItemStatus = "MATCH" | "MISMATCH" | "NEEDS_REVIEW";

type CombinedItem = {
  itemId: number;
  itemSku: string;
  itemName: string;
  combinedQty: number;
  systemQty: number;
  difference: number;
  status: ItemStatus;
  hasConflict: boolean;
  locationBreakdown: LocationBreakdownRow[];
};

type CombineResponse = {
  opnameNumbers: string[];
  sessionCount: number;
  emptyConfirmations: number;
  items: CombinedItem[];
  summary: {
    totalSkus: number;
    matches: number;
    mismatches: number;
    needsReview: number;
    totalCombinedQty: number;
    totalSystemQty: number;
  };
};

// Selections key: `${itemId}-${locationCode}` -> chosen opnameNumber, for
// locations where sessions disagreed on the quantity.
type Selections = Record<string, string>;

function selectionKey(itemId: number, locationCode: string) {
  return `${itemId}-${locationCode}`;
}

function effectiveQtyForLocation(loc: LocationBreakdownRow, selections: Selections, itemId: number): number | null {
  if (!loc.conflict) return loc.resolvedQty;
  const chosen = selections[selectionKey(itemId, loc.locationCode)];
  if (!chosen) return null;
  return loc.entries.find((e) => e.opnameNumber === chosen)?.countedQty ?? null;
}

function effectiveItem(item: CombinedItem, selections: Selections) {
  let combinedQty = 0;
  let unresolved = false;
  for (const loc of item.locationBreakdown) {
    const qty = effectiveQtyForLocation(loc, selections, item.itemId);
    if (qty !== null) combinedQty += qty;
    if (loc.conflict && qty === null) unresolved = true;
  }
  const difference = combinedQty - item.systemQty;
  const status: ItemStatus = unresolved ? "NEEDS_REVIEW" : difference === 0 ? "MATCH" : "MISMATCH";
  return { combinedQty, difference, status };
}

function describeLocation(loc: LocationBreakdownRow, selections: Selections, itemId: number): string {
  if (loc.entries.length === 0) return "(Not scanned)";
  if (!loc.conflict) return loc.entries.map((e) => e.opnameNumber).join(" & ");
  const chosen = selections[selectionKey(itemId, loc.locationCode)];
  if (!chosen) return `Conflict: ${loc.entries.map((e) => `${e.opnameNumber}=${e.countedQty}`).join(" vs ")}`;
  return `Resolved: ${chosen} (of ${loc.entries.map((e) => e.opnameNumber).join(", ")})`;
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const styles: Record<ItemStatus, string> = {
    MATCH: "bg-emerald-950 text-emerald-300",
    MISMATCH: "bg-amber-950 text-amber-300",
    NEEDS_REVIEW: "bg-purple-950 text-purple-300",
  };
  const labels: Record<ItemStatus, string> = {
    MATCH: "Match",
    MISMATCH: "Mismatch",
    NEEDS_REVIEW: "Needs Review",
  };
  return <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${styles[status]}`}>{labels[status]}</span>;
}

export default function CombineCsoPanel() {
  const [sessions, setSessions] = useState<CsoSession[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [combining, setCombining] = useState(false);
  const [result, setResult] = useState<CombineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | ItemStatus>("ALL");
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Selections>({});

  useEffect(() => {
    refreshSessions();
  }, []);

  async function refreshSessions() {
    setLoadingSessions(true);
    const res = await fetch("/api/stock-opname/combine");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
    }
    setLoadingSessions(false);
  }

  function toggle(opnameNumber: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opnameNumber)) next.delete(opnameNumber);
      else next.add(opnameNumber);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === sessions.length ? new Set() : new Set(sessions.map((s) => s.opnameNumber))));
  }

  async function handleCombine() {
    if (selected.size === 0) return;
    setCombining(true);
    setError(null);
    setResult(null);
    setExpandedItemId(null);
    setSelections({});

    const res = await fetch("/api/stock-opname/combine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opnameNumbers: Array.from(selected) }),
    });
    setCombining(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to combine");
      return;
    }

    setResult(await res.json());
    setStatusFilter("ALL");
  }

  function chooseConflict(itemId: number, locationCode: string, opnameNumber: string) {
    setSelections((prev) => ({ ...prev, [selectionKey(itemId, locationCode)]: opnameNumber }));
  }

  function handleExport() {
    if (!result) return;

    const summaryRows = result.items.map((item) => {
      const eff = effectiveItem(item, selections);
      return {
        SKU: item.itemSku,
        Product: item.itemName,
        "Combined Qty": eff.combinedQty,
        "System Qty": item.systemQty,
        Difference: eff.difference,
        Status: eff.status,
      };
    });

    const detailRows = result.items.flatMap((item) =>
      item.locationBreakdown.map((loc) => {
        const qty = effectiveQtyForLocation(loc, selections, item.itemId);
        const match = qty === null ? (loc.systemQty === null || loc.systemQty === 0 ? "" : "UNRESOLVED") : qty === (loc.systemQty ?? 0) ? "MATCH" : "MISMATCH";
        return {
          SKU: item.itemSku,
          Location: loc.locationCode,
          "System Qty": loc.systemQty ?? "",
          Resolution: describeLocation(loc, selections, item.itemId),
          "Effective Qty": qty ?? "",
          Match: match,
        };
      })
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Location Detail");
    XLSX.writeFile(wb, `combine-cso-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const itemsWithEffective = (result?.items ?? []).map((item) => ({ item, eff: effectiveItem(item, selections) }));

  const filteredItems =
    statusFilter === "ALL" ? itemsWithEffective : itemsWithEffective.filter(({ eff }) => eff.status === statusFilter);

  const liveSummary = result
    ? {
        matches: itemsWithEffective.filter(({ eff }) => eff.status === "MATCH").length,
        mismatches: itemsWithEffective.filter(({ eff }) => eff.status === "MISMATCH").length,
        needsReview: itemsWithEffective.filter(({ eff }) => eff.status === "NEEDS_REVIEW").length,
        totalCombinedQty: itemsWithEffective.reduce((sum, { eff }) => sum + eff.combinedQty, 0),
      }
    : null;

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-4">
        Select the individual CSO stock opname sessions that together cover the warehouse (e.g.{" "}
        <span className="font-mono">CSO-Budi-01</span>, <span className="font-mono">CSO-Siti-02</span>), then
        combine them — every counted line across the selected sessions is summed per SKU and checked against
        the system's current total stock for that SKU across every location, not just what was counted. If two
        sessions counted the same location and agree on the quantity, it's counted once, not twice. If they
        disagree, you'll be asked which one to use. This is a read-only check — nothing gets changed.
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
          <button onClick={toggleAll} className="text-xs text-amber-500 hover:text-amber-400">
            {selected.size === sessions.length && sessions.length > 0 ? "Deselect all" : "Select all"}
          </button>
          <span className="text-xs text-zinc-600">{selected.size} selected</span>
        </div>
        {loadingSessions ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">
            No CSO-prefixed sessions found. Create one from the Stock Opname tab with an opname number like{" "}
            <span className="font-mono">CSO-Budi-01</span>.
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-zinc-900">
            {sessions.map((s) => (
              <label
                key={s.opnameNumber}
                className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-900/50 cursor-pointer"
              >
                <input type="checkbox" checked={selected.has(s.opnameNumber)} onChange={() => toggle(s.opnameNumber)} />
                <span className="font-mono text-amber-500">{s.opnameNumber}</span>
                <span className="text-xs text-zinc-500">
                  {s.countedLines}/{s.totalLines} counted
                </span>
                {s.notes && <span className="text-xs text-zinc-600 truncate">{s.notes}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleCombine}
          disabled={selected.size === 0 || combining}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {combining ? "Combining..." : `Combine & Compare (${selected.size})`}
        </button>
        {result && (
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-md border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            Export to Excel
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {result && liveSummary && (
        <div>
          <div className="flex gap-6 mb-5 flex-wrap">
            <SummaryStat label="Sessions" value={result.sessionCount} />
            <SummaryStat label="SKUs" value={result.summary.totalSkus} />
            <SummaryStat label="Match" value={liveSummary.matches} accent="text-emerald-400" />
            <SummaryStat label="Mismatch" value={liveSummary.mismatches} accent="text-amber-400" />
            {liveSummary.needsReview > 0 && (
              <SummaryStat label="Needs Review" value={liveSummary.needsReview} accent="text-purple-400" />
            )}
            <SummaryStat label="Combined Qty" value={liveSummary.totalCombinedQty} />
            <SummaryStat label="System Qty" value={result.summary.totalSystemQty} />
            {result.emptyConfirmations > 0 && (
              <SummaryStat label="Empty Confirmations" value={result.emptyConfirmations} accent="text-zinc-500" />
            )}
          </div>

          <div className="flex items-center gap-2 mb-3">
            {(["ALL", "NEEDS_REVIEW", "MISMATCH", "MATCH"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${
                  statusFilter === s ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {s === "ALL" ? "All" : s === "MATCH" ? "Match" : s === "MISMATCH" ? "Mismatch" : "Needs Review"}
              </button>
            ))}
          </div>

          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-3 py-2 font-medium"></th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium text-right">Combined Counted Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Current System Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Difference</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-zinc-600">
                      No rows in this category.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(({ item, eff }) => {
                    const expanded = expandedItemId === item.itemId;
                    return (
                      <>
                        <tr
                          key={item.itemId}
                          onClick={() => setExpandedItemId(expanded ? null : item.itemId)}
                          className="border-t border-zinc-800/60 hover:bg-zinc-900/50 transition-colors cursor-pointer"
                        >
                          <td className="px-3 py-1.5 text-zinc-600 w-5">
                            <span className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-zinc-300">{item.itemSku}</td>
                          <td className="px-3 py-1.5 text-zinc-500">{item.itemName}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{eff.combinedQty.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                            {item.systemQty.toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {eff.difference === 0 ? (
                              <span className="text-emerald-400">0</span>
                            ) : (
                              <span className={eff.difference > 0 ? "text-amber-400" : "text-red-400"}>
                                {eff.difference > 0 ? "+" : ""}
                                {eff.difference.toLocaleString()}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <StatusBadge status={eff.status} />
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${item.itemId}-detail`} className="border-t border-zinc-800/60">
                            <td colSpan={7} className="px-4 py-3 bg-zinc-950/50">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-zinc-600 text-left border-b border-zinc-800">
                                    <th className="py-1 pr-4">Location</th>
                                    <th className="py-1 pr-4 text-right">System Qty</th>
                                    <th className="py-1 pr-4">Match</th>
                                    <th className="py-1 pr-4">CSO Count(s)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.locationBreakdown.map((loc) => {
                                    const effQty = effectiveQtyForLocation(loc, selections, item.itemId);
                                    const locMatch: ItemStatus | null =
                                      effQty === null && !loc.conflict
                                        ? (loc.systemQty ?? 0) === 0
                                          ? "MATCH"
                                          : "MISMATCH"
                                        : effQty !== null
                                          ? effQty === (loc.systemQty ?? 0)
                                            ? "MATCH"
                                            : "MISMATCH"
                                          : null;
                                    return (
                                      <tr key={loc.locationCode} className="border-b border-zinc-900 last:border-0 align-top">
                                        <td className="py-1.5 pr-4 font-mono text-zinc-300">{loc.locationCode}</td>
                                        <td className="py-1.5 pr-4 text-right font-mono text-zinc-400">
                                          {loc.systemQty !== null ? loc.systemQty.toLocaleString() : "—"}
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          {locMatch ? (
                                            <StatusBadge status={locMatch} />
                                          ) : (
                                            <StatusBadge status="NEEDS_REVIEW" />
                                          )}
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          {loc.entries.length === 0 ? (
                                            <span className="text-zinc-600 italic">(Not scanned)</span>
                                          ) : !loc.conflict ? (
                                            <span>
                                              <span className="font-mono text-amber-500">
                                                {loc.entries.map((e) => e.opnameNumber).join(" & ")}
                                              </span>
                                              <span className="text-zinc-400">
                                                , quantity {loc.resolvedQty?.toLocaleString()}
                                              </span>
                                            </span>
                                          ) : (
                                            <div className="space-y-1">
                                              {loc.entries.map((e) => (
                                                <label
                                                  key={e.opnameNumber}
                                                  className="flex items-center gap-2 cursor-pointer"
                                                >
                                                  <input
                                                    type="radio"
                                                    name={`conflict-${item.itemId}-${loc.locationCode}`}
                                                    checked={
                                                      selections[selectionKey(item.itemId, loc.locationCode)] ===
                                                      e.opnameNumber
                                                    }
                                                    onChange={() => chooseConflict(item.itemId, loc.locationCode, e.opnameNumber)}
                                                  />
                                                  <span className="font-mono text-amber-500">{e.opnameNumber}</span>
                                                  <span className="font-mono">{e.countedQty.toLocaleString()}</span>
                                                  <span className="text-zinc-500">{e.countedByUsername ?? "—"}</span>
                                                </label>
                                              ))}
                                              {!selections[selectionKey(item.itemId, loc.locationCode)] && (
                                                <span className="text-[10px] text-purple-400">Pick one to resolve</span>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className={`text-xl font-semibold ${accent ?? "text-zinc-200"}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}