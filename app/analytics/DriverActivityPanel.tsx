"use client";

import { Fragment, useState } from "react";

type DriverSummary = {
  userId: number;
  username: string;
  inboundCount: number;
  inboundQty: number;
  outboundCount: number;
  outboundQty: number;
  otherCount: number;
  otherQty: number;
  totalCount: number;
  lastActivityAt: string | null;
};

type Category = "INBOUND" | "OUTBOUND" | "OTHER";

type EventItem = {
  id: number;
  itemSku: string;
  itemName: string;
  quantity: number;
  createdAt: string;
};

type RouteGroup = {
  from: string;
  to: string;
  count: number;
  totalQty: number;
  events: EventItem[];
};

type CategoryGroup = {
  category: Category;
  count: number;
  totalQty: number;
  routes: RouteGroup[];
};

type DriverDetail = {
  username: string;
  categories: CategoryGroup[];
};

const CATEGORY_LABELS: Record<Category, string> = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  OTHER: "Other (Perpindahan Lokasi)",
};

const CATEGORY_STYLES: Record<Category, string> = {
  INBOUND: "bg-emerald-950 text-emerald-300",
  OUTBOUND: "bg-sky-950 text-sky-300",
  OTHER: "bg-zinc-800 text-zinc-400",
};

const CATEGORY_HINTS: Record<Category, string> = {
  INBOUND: "Floor → Rack",
  OUTBOUND: "Rack or Floor → Outbound WH",
  OTHER: "Everything else (rack-to-rack moves, etc.)",
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

  const [expandedDriverId, setExpandedDriverId] = useState<number | null>(null);
  const [driverDetail, setDriverDetail] = useState<Record<number, DriverDetail>>({});
  const [driverDetailLoading, setDriverDetailLoading] = useState<number | null>(null);
  const [driverDetailError, setDriverDetailError] = useState<string | null>(null);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

  const rangeIso = () => ({
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  });

  async function handleFetch() {
    setLoading(true);
    setError(null);
    setExpandedDriverId(null);
    setDriverDetail({});
    setExpandedCategories(new Set());
    setExpandedRoutes(new Set());

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

  async function toggleDriver(userId: number) {
    if (expandedDriverId === userId) {
      setExpandedDriverId(null);
      return;
    }
    setExpandedDriverId(userId);

    if (driverDetail[userId]) return;

    setDriverDetailLoading(userId);
    setDriverDetailError(null);

    const { startIso, endIso } = rangeIso();
    const res = await fetch(
      `/api/analytics/driver-activity/${userId}?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
    );

    setDriverDetailLoading(null);

    if (!res.ok) {
      const data = await res.json();
      setDriverDetailError(data.error ?? "Failed to load driver's activity");
      return;
    }

    const data: DriverDetail = await res.json();
    setDriverDetail((prev) => ({ ...prev, [userId]: data }));
  }

  function toggleCategory(userId: number, category: Category) {
    const key = `${userId}:${category}`;
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRoute(userId: number, category: Category, routeKey: string) {
    const key = `${userId}:${category}:${routeKey}`;
    setExpandedRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">Driver Activity (v2)</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Forklift Driver activity sourced from Location Stock events, classified purely by
        location type: Inbound is Floor → Rack, Outbound is Rack or Floor → Outbound WH, Other
        covers everything else (rack-to-rack moves / perpindahan lokasi).
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
          <div className="border border-zinc-800 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 text-zinc-500 text-left">
                  <th className="px-4 py-3 font-medium rounded-tl-lg">Driver</th>
                  <th className="px-4 py-3 font-medium text-right">Inbound</th>
                  <th className="px-4 py-3 font-medium text-right">Outbound</th>
                  <th className="px-4 py-3 font-medium text-right">Other</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Last Activity</th>
                  <th className="px-4 py-3 font-medium rounded-tr-lg"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = driverDetail[row.userId];
                  const isOpen = expandedDriverId === row.userId;
                  return (
                    <Fragment key={row.userId}>
                      <tr className="border-t border-zinc-800 hover:bg-zinc-900/50">
                        <td className="px-4 py-3 text-zinc-300">{row.username}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {row.inboundCount.toLocaleString()}
                          <span className="text-zinc-500 text-xs"> / {row.inboundQty.toLocaleString()}u</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {row.outboundCount.toLocaleString()}
                          <span className="text-zinc-500 text-xs"> / {row.outboundQty.toLocaleString()}u</span>
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
                            onClick={() => toggleDriver(row.userId)}
                            className="text-xs text-amber-500 hover:text-amber-400"
                          >
                            {isOpen ? "Hide" : "Details"}
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="border-t border-zinc-800 bg-zinc-950/50">
                          <td colSpan={7} className="p-0">
                            <div className="w-full px-4 md:px-6 py-5">
                              {driverDetailLoading === row.userId && !d ? (
                                <p className="text-xs text-zinc-500">Loading activity...</p>
                              ) : driverDetailError ? (
                                <p className="text-xs text-red-400">{driverDetailError}</p>
                              ) : d ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {d.categories.map((cat) => (
                                    <CategoryCard
                                      key={cat.category}
                                      userId={row.userId}
                                      cat={cat}
                                      expandedCategories={expandedCategories}
                                      expandedRoutes={expandedRoutes}
                                      onToggleCategory={toggleCategory}
                                      onToggleRoute={toggleRoute}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
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

function CategoryCard({
  userId,
  cat,
  expandedCategories,
  expandedRoutes,
  onToggleCategory,
  onToggleRoute,
}: {
  userId: number;
  cat: CategoryGroup;
  expandedCategories: Set<string>;
  expandedRoutes: Set<string>;
  onToggleCategory: (userId: number, category: Category) => void;
  onToggleRoute: (userId: number, category: Category, routeKey: string) => void;
}) {
  const categoryKey = `${userId}:${cat.category}`;
  const isOpen = expandedCategories.has(categoryKey);

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-950/40 flex flex-col">
      <button
        onClick={() => onToggleCategory(userId, cat.category)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-900/40 transition-colors"
      >
        <div>
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${CATEGORY_STYLES[cat.category]}`}
          >
            {CATEGORY_LABELS[cat.category]}
          </span>
          <p className="text-[10px] text-zinc-600 mt-1">{CATEGORY_HINTS[cat.category]}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono text-zinc-300">{cat.totalQty.toLocaleString()}u</div>
          <div className="text-[10px] text-zinc-600">{cat.count.toLocaleString()} txn</div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-zinc-800 p-2 overflow-x-auto">
          {cat.routes.length === 0 ? (
            <p className="text-xs text-zinc-600 p-2">No activity in this range.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-600 text-left">
                  <th className="px-2 py-1.5 font-medium">From</th>
                  <th className="px-2 py-1.5 font-medium">To</th>
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5 font-medium text-right">Qty</th>
                  <th className="px-2 py-1.5 font-medium text-right">Txns</th>
                  <th className="px-2 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {cat.routes.map((route) => {
                  const routeKey = `${route.from}→${route.to}`;
                  const routeOpen = expandedRoutes.has(`${userId}:${cat.category}:${routeKey}`);
                  const isCombined = route.count > 1;

                  return (
                    <Fragment key={routeKey}>
                      <tr className="border-t border-zinc-900">
                        <td className="px-2 py-1.5 font-mono text-zinc-400">{route.from}</td>
                        <td className="px-2 py-1.5 font-mono text-amber-500">{route.to}</td>
                        <td className="px-2 py-1.5">
                          {isCombined ? (
                            <span className="text-zinc-600">multiple</span>
                          ) : (
                            <>
                              <span className="font-mono text-zinc-300">{route.events[0].itemSku}</span>{" "}
                              <span className="text-zinc-600">{route.events[0].itemName}</span>
                            </>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">{route.totalQty.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-zinc-500">{route.count}</td>
                        <td className="px-2 py-1.5 text-right">
                          {isCombined && (
                            <button
                              onClick={() => onToggleRoute(userId, cat.category, routeKey)}
                              className="text-[10px] text-amber-500 hover:text-amber-400"
                            >
                              {routeOpen ? "Hide" : "Details"}
                            </button>
                          )}
                        </td>
                      </tr>

                      {isCombined && routeOpen && (
                        <tr className="bg-zinc-900/40">
                          <td colSpan={6} className="px-2 py-2">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-zinc-600 text-left">
                                  <th className="px-2 py-1 font-medium">Item</th>
                                  <th className="px-2 py-1 font-medium text-right">Qty</th>
                                  <th className="px-2 py-1 font-medium text-right">When</th>
                                </tr>
                              </thead>
                              <tbody>
                                {route.events.map((ev) => (
                                  <tr key={ev.id} className="border-t border-zinc-900">
                                    <td className="px-2 py-1">
                                      <span className="font-mono text-zinc-300">{ev.itemSku}</span>{" "}
                                      <span className="text-zinc-600">{ev.itemName}</span>
                                    </td>
                                    <td className="px-2 py-1 text-right font-mono">
                                      {ev.quantity.toLocaleString()}
                                    </td>
                                    <td className="px-2 py-1 text-right text-zinc-500">
                                      {new Date(ev.createdAt).toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
      )}
    </div>
  );
}