"use client";

import { useState, useEffect } from "react";

type CsoSession = {
  opnameNumber: string;
  notes: string | null;
  completedAt: string | null;
  totalLines: number;
  countedLines: number;
};

type SystemLocationEntry = { locationCode: string; quantity: number };
type CountedLocationEntry = {
  opnameNumber: string;
  locationCode: string;
  countedQty: number;
  countedAt: string | null;
  countedByUsername: string | null;
};

type CombinedItem = {
  itemId: number;
  itemSku: string;
  itemName: string;
  combinedQty: number;
  systemQty: number;
  difference: number;
  status: "MATCH" | "MISMATCH";
  systemLocations: SystemLocationEntry[];
  countedLocations: CountedLocationEntry[];
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
    totalCombinedQty: number;
    totalSystemQty: number;
  };
};

export default function CombineCsoPanel() {
  const [sessions, setSessions] = useState<CsoSession[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [combining, setCombining] = useState(false);
  const [result, setResult] = useState<CombineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MATCH" | "MISMATCH">("ALL");
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

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

  const filteredItems = result
    ? statusFilter === "ALL"
      ? result.items
      : result.items.filter((i) => i.status === statusFilter)
    : [];

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-4">
        Select the individual CSO stock opname sessions that together cover the warehouse (e.g.{" "}
        <span className="font-mono">CSO-Budi-01</span>, <span className="font-mono">CSO-Siti-02</span>), then
        combine them — every counted line across the selected sessions is summed per SKU and checked against
        the system's current total stock for that SKU across every location, not just what was counted. This
        is a read-only check — nothing gets changed.
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

      <button
        onClick={handleCombine}
        disabled={selected.size === 0 || combining}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors mb-4"
      >
        {combining ? "Combining..." : `Combine & Compare (${selected.size})`}
      </button>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {result && (
        <div>
          <div className="flex gap-6 mb-5 flex-wrap">
            <SummaryStat label="Sessions" value={result.sessionCount} />
            <SummaryStat label="SKUs" value={result.summary.totalSkus} />
            <SummaryStat label="Match" value={result.summary.matches} accent="text-emerald-400" />
            <SummaryStat label="Mismatch" value={result.summary.mismatches} accent="text-amber-400" />
            <SummaryStat label="Combined Qty" value={result.summary.totalCombinedQty} />
            <SummaryStat label="System Qty" value={result.summary.totalSystemQty} />
            {result.emptyConfirmations > 0 && (
              <SummaryStat label="Empty Confirmations" value={result.emptyConfirmations} accent="text-zinc-500" />
            )}
          </div>

          <div className="flex items-center gap-2 mb-3">
            {(["ALL", "MISMATCH", "MATCH"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${
                  statusFilter === s ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {s === "ALL" ? "All" : s === "MATCH" ? "Match" : "Mismatch"}
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
                  filteredItems.map((item) => {
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
                          <td className="px-3 py-1.5 text-right font-mono">{item.combinedQty.toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-zinc-400">
                            {item.systemQty.toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {item.difference === 0 ? (
                              <span className="text-emerald-400">0</span>
                            ) : (
                              <span className={item.difference > 0 ? "text-amber-400" : "text-red-400"}>
                                {item.difference > 0 ? "+" : ""}
                                {item.difference.toLocaleString()}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                item.status === "MATCH" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"
                              }`}
                            >
                              {item.status === "MATCH" ? "Match" : "Mismatch"}
                            </span>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${item.itemId}-detail`} className="border-t border-zinc-800/60">
                            <td colSpan={7} className="px-4 py-3 bg-zinc-950/50">
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
                                    Total System Stock by Location ({item.systemLocations.length})
                                  </h4>
                                  {item.systemLocations.length === 0 ? (
                                    <p className="text-xs text-zinc-700">No current stock anywhere in the system.</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-zinc-600 text-left border-b border-zinc-800">
                                          <th className="py-1 pr-4">Location</th>
                                          <th className="py-1 pr-4 text-right">Qty</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.systemLocations.map((loc, i) => (
                                          <tr key={i} className="border-b border-zinc-900 last:border-0">
                                            <td className="py-1 pr-4 font-mono text-zinc-300">{loc.locationCode}</td>
                                            <td className="py-1 pr-4 text-right font-mono text-zinc-400">
                                              {loc.quantity.toLocaleString()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>

                                <div>
                                  <h4 className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
                                    CSO Locations Counted ({item.countedLocations.length})
                                  </h4>
                                  {item.countedLocations.length === 0 ? (
                                    <p className="text-xs text-zinc-700">Not counted in any selected session.</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-zinc-600 text-left border-b border-zinc-800">
                                          <th className="py-1 pr-4">Session</th>
                                          <th className="py-1 pr-4">Location</th>
                                          <th className="py-1 pr-4 text-right">Counted</th>
                                          <th className="py-1 pr-4">By</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.countedLocations.map((loc, i) => (
                                          <tr key={i} className="border-b border-zinc-900 last:border-0">
                                            <td className="py-1 pr-4 font-mono text-amber-500">{loc.opnameNumber}</td>
                                            <td className="py-1 pr-4 font-mono text-zinc-300">{loc.locationCode}</td>
                                            <td className="py-1 pr-4 text-right font-mono text-zinc-400">
                                              {loc.countedQty.toLocaleString()}
                                            </td>
                                            <td className="py-1 pr-4 text-zinc-500">{loc.countedByUsername ?? "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </div>
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