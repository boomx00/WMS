"use client";

import { useState } from "react";
import { EVENT_TYPE_STYLES, EVENT_TYPE_LABELS } from "@/lib/eventTypes";

type Totals = {
  totalIn: number;
  totalOut: number;
  inboundCount: number;
  outboundCount: number;
};

type Event = {
  eventId: number;
  type: string;
  quantity: number;
  createdAt: string;
  label: string;
  locationCode: string;
  username: string;
};

type SkuRow = {
  itemSku: string;
  itemName: string;
  totalIn: number;
  totalOut: number;
  events: Event[];
};



function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function MovementSummary() {
  const [start, setStart] = useState(todayStr());
  const [end, setEnd] = useState(todayStr());
  const [totals, setTotals] = useState<Totals | null>(null);
  const [bySku, setBySku] = useState<SkuRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/transactions/summary?start=${start}&end=${end}`);

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to load summary");
      return;
    }

    const data = await res.json();
    setTotals(data.totals);
    setBySku(data.bySku);
    setExpanded(new Set());
  }

  function toggle(sku: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 mb-6">
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">From</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">To</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <button
          onClick={handleFetch}
          disabled={loading}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading..." : "Get Summary"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {totals && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="border border-blue-900 bg-blue-950/30 rounded-lg px-4 py-3">
              <div className="text-xs text-blue-400 uppercase tracking-wide">Total In</div>
              <div className="text-2xl font-mono mt-1">{totals.totalIn.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 mt-1">{totals.inboundCount} event(s)</div>
            </div>
            <div className="border border-red-900 bg-red-950/30 rounded-lg px-4 py-3">
              <div className="text-xs text-red-400 uppercase tracking-wide">Total Out</div>
              <div className="text-2xl font-mono mt-1">{totals.totalOut.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 mt-1">{totals.outboundCount} event(s)</div>
            </div>
          </div>

          {bySku.length > 0 && (
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              {bySku.map((row) => {
                const isOpen = expanded.has(row.itemSku);
                return (
                  <div key={row.itemSku} className="border-b border-zinc-800 last:border-b-0">
                    <button
                      onClick={() => toggle(row.itemSku)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-900/60 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-xs">
                        <span className={`text-zinc-500 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                          ▶
                        </span>
                        <span className="font-mono text-zinc-300">{row.itemSku}</span>
                        <span className="text-zinc-500">{row.itemName}</span>
                      </span>
                      <span className="text-xs font-mono">
                        <span className="text-blue-400">{row.totalIn > 0 ? `+${row.totalIn}` : "—"}</span>
                        {"  "}
                        <span className="text-red-400">{row.totalOut > 0 ? `-${row.totalOut}` : "—"}</span>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="bg-zinc-950/50 px-3 pb-2">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-zinc-600 text-left">
                              <th className="py-1 font-medium">Type</th>
                              <th className="py-1 font-medium">Label</th>
                              <th className="py-1 font-medium">Location</th>
                              <th className="py-1 font-medium text-right">Qty</th>
                              <th className="py-1 font-medium">User</th>
                              <th className="py-1 font-medium text-right">When</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.events.map((e) => (
                              <tr key={e.eventId} className="border-t border-zinc-800/50">
                                <td className="py-1">
                                  <span
                                    className={`text-[9px] uppercase tracking-wide px-1 py-0.5 rounded ${
                                      EVENT_TYPE_STYLES[e.type] ?? "bg-zinc-800 text-zinc-400"
                                    }`}
                                  >
                                    {e.type}
                                  </span>
                                </td>
                                <td className="py-1 font-mono text-zinc-500">{e.label}</td>
                                <td className="py-1 font-mono text-amber-500">{e.locationCode}</td>
                                <td className="py-1 text-right font-mono">{e.quantity.toLocaleString()}</td>
                                <td className="py-1 text-zinc-400">{e.username}</td>
                                <td className="py-1 text-right text-zinc-500">
                                  {new Date(e.createdAt).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}