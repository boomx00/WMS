"use client";

import { useState } from "react";

type Row = {
  username: string;
  palletCount: number;
  totalUnits: number;
};

// Formats a Date as "YYYY-MM-DDTHH:mm" in LOCAL time (what datetime-local
// inputs expect) — toISOString() would incorrectly shift to UTC.
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function nowStr() {
  return toLocalInputValue(new Date());
}

function firstOfMonthStr() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return toLocalInputValue(d);
}

export default function InboundByPersonChart() {
  const [start, setStart] = useState(firstOfMonthStr());
  const [end, setEnd] = useState(nowStr());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setLoading(true);
    setError(null);

    // Convert the local wall-clock string to an absolute UTC instant before
    // sending — the browser correctly interprets a bare "YYYY-MM-DDTHH:mm"
    // string as local time, so new Date(start) gives the right moment
    // regardless of what timezone the server itself runs in.
    const startIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();

    const res = await fetch(
      `/api/analytics/inbound-by-person?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
    );

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to load analytics");
      return;
    }

    setRows(await res.json());
  }

  const maxCount = rows ? Math.max(...rows.map((r) => r.palletCount), 1) : 1;

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-4">Pallets Inbounded per Person</h2>

      <div className="flex items-end gap-3 mb-6 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">From</label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">To</label>
          <input
            type="datetime-local"
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
          {loading ? "Loading..." : "Get Data"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {rows && (
        rows.length === 0 ? (
          <p className="text-sm text-zinc-600">No inbound activity in this range.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.username}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-zinc-300">{row.username}</span>
                  <span className="text-xs text-zinc-500 font-mono">
                    {row.palletCount.toLocaleString()} pallet(s) · {row.totalUnits.toLocaleString()} units
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${(row.palletCount / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}