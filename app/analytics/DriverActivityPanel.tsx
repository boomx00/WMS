"use client";

import { Fragment, useState } from "react";

type DriverSummary = {
  userId: number;
  username: string;
  inboundCount: number;
  inboundQty: number;
  pickingCount: number;
  pickingQty: number;
  otherCount: number;
  otherQty: number;
  totalCount: number;
  lastActivityAt: string | null;
};

type DriverEvent = {
  id: number;
  type: string;
  category: "INBOUND" | "PICKING" | "OTHER";
  itemSku: string;
  itemName: string;
  sourceCode: string | null;
  destCode: string | null;
  quantity: number;
  createdAt: string;
};

type DriverDetail = {
  username: string;
  page: number;
  totalPages: number;
  totalCount: number;
  events: DriverEvent[];
};

const CATEGORY_STYLES: Record<string, string> = {
  INBOUND: "bg-emerald-950 text-emerald-300",
  PICKING: "bg-sky-950 text-sky-300",
  OTHER: "bg-zinc-800 text-zinc-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  INBOUND: "Inbound",
  PICKING: "Picking",
  OTHER: "Other",
};

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const toLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return { start: toLocal(start), end: toLocal(end) };
}

export default function DriverActivityPanel() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [rows, setRows] = useState<DriverSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, DriverDetail>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const rangeIso = () => ({
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  });

  async function handleFetch() {
    setLoading(true);
    setError(null);
    setExpandedId(null);
    setDetail({});

    const { startIso, endIso } = rangeIso();
    const res = await fetch(
      `/api/analytics/driver-activity?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
    );

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to load driver activity");
      return;
    }

    setRows(await res.json());
  }

  async function fetchDetailPage(userId: number, page: number, append: boolean) {
    setDetailLoading(userId);
    setDetailError(null);

    const { startIso, endIso } = rangeIso();
    const res = await fetch(
      `/api/analytics/driver-activity/${userId}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&page=${page}`
    );

    setDetailLoading(null);

    if (!res.ok) {
      const data = await res.json();
      setDetailError(data.error ?? "Failed to load driver's events");
      return;
    }

    const data: DriverDetail = await res.json();
    setDetail((prev) => {
      const existing = prev[userId];
      const events = append && existing ? [...existing.events, ...data.events] : data.events;
      return { ...prev, [userId]: { ...data, events } };
    });
  }

  function toggleExpand(userId: number) {
    if (expandedId === userId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(userId);
    if (!detail[userId]) {
      fetchDetailPage(userId, 1, false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">Driver Activity (v2)</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Forklift Driver activity sourced from Location Stock events.
        Inbound = Floor → Rack, Picking = any pick/default-pick. Other
        movement (rack-to-rack moves, adjustments, ship) is grouped as
        Other rather than dropped.
      </p>

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

      {rows &&
        (rows.length === 0 ? (
          <p className="text-sm text-zinc-600">No Forklift Driver users found.</p>
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium text-right">Inbound</th>
                  <th className="px-4 py-3 font-medium text-right">Picking</th>
                  <th className="px-4 py-3 font-medium text-right">Other</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Last Activity</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = detail[row.userId];
                  return (
                    <Fragment key={row.userId}>
                      <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
                        <td className="px-4 py-3 text-zinc-300">{row.username}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {row.inboundCount.toLocaleString()}
                          <span className="text-zinc-500 text-xs"> / {row.inboundQty.toLocaleString()}u</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {row.pickingCount.toLocaleString()}
                          <span className="text-zinc-500 text-xs"> / {row.pickingQty.toLocaleString()}u</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-500">
                          {row.otherCount.toLocaleString()}
                          <span className="text-xs"> / {row.otherQty.toLocaleString()}u</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-amber-500">
                          {row.totalCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                          {row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => toggleExpand(row.userId)}
                            className="text-xs text-amber-500 hover:text-amber-400"
                          >
                            {expandedId === row.userId ? "Hide" : "Details"}
                          </button>
                        </td>
                      </tr>

                      {expandedId === row.userId && (
                        <tr className="border-t border-zinc-800 bg-zinc-950/50">
                          <td colSpan={7} className="px-4 py-4">
                            {detailLoading === row.userId && !d ? (
                              <p className="text-xs text-zinc-500">Loading events...</p>
                            ) : detailError ? (
                              <p className="text-xs text-red-400">{detailError}</p>
                            ) : d && d.events.length === 0 ? (
                              <p className="text-xs text-zinc-600">No events in this range.</p>
                            ) : d ? (
                              <div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-zinc-600 text-left">
                                      <th className="px-2 py-1.5 font-medium">Category</th>
                                      <th className="px-2 py-1.5 font-medium">Product</th>
                                      <th className="px-2 py-1.5 font-medium">From</th>
                                      <th className="px-2 py-1.5 font-medium">To</th>
                                      <th className="px-2 py-1.5 font-medium text-right">Qty</th>
                                      <th className="px-2 py-1.5 font-medium text-right">When</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.events.map((ev) => (
                                      <tr key={ev.id} className="border-t border-zinc-900">
                                        <td className="px-2 py-1.5">
                                          <span
                                            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${CATEGORY_STYLES[ev.category]}`}
                                          >
                                            {CATEGORY_LABELS[ev.category]}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <span className="font-mono text-zinc-300">{ev.itemSku}</span>{" "}
                                          <span className="text-zinc-600">{ev.itemName}</span>
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-amber-500">
                                          {ev.sourceCode ?? "—"}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-amber-500">
                                          {ev.destCode ?? "—"}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono">
                                          {ev.quantity.toLocaleString()}
                                        </td>
                                        <td className="px-2 py-1.5 text-right text-zinc-500">
                                          {new Date(ev.createdAt).toLocaleString()}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>

                                <div className="flex items-center justify-between mt-2">
                                  <p className="text-[10px] text-zinc-600">
                                    {d.events.length.toLocaleString()} of {d.totalCount.toLocaleString()} event(s)
                                  </p>
                                  {d.page < d.totalPages && (
                                    <button
                                      onClick={() => fetchDetailPage(row.userId, d.page + 1, true)}
                                      disabled={detailLoading === row.userId}
                                      className="text-[10px] text-amber-500 hover:text-amber-400 disabled:opacity-50"
                                    >
                                      {detailLoading === row.userId ? "Loading..." : "Load more"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
