"use client";

import { Fragment, useState } from "react";
import { formatDateTime24 } from "@/lib/formatDate";

type LineItem = {
  itemId: number;
  itemSku: string;
  itemName: string;
  quantity: number;
};

type SalesOrderShipped = {
  salesOrderId: number;
  soNumber: string;
  orderDate: string;
  lastShippedAt: string;
  totalQuantity: number;
  skuCount: number;
  lines: LineItem[];
};

type SalesOrdersShippedResponse = {
  totalSalesOrders: number;
  totalUnits: number;
  totalSkus: number;
  salesOrders: SalesOrderShipped[];
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

export default function SalesOrdersShippedPanel() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState<SalesOrdersShippedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  async function handleFetch() {
    setLoading(true);
    setError(null);
    setExpanded(new Set());

    const startIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();

    const res = await fetch(
      `/api/analytics/sales-orders-shipped?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
    );

    setLoading(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to load sales orders shipped");
      return;
    }

    setData(await res.json());
  }

  function toggle(soId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(soId)) next.delete(soId);
      else next.add(soId);
      return next;
    });
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">Sales Orders Shipped</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Which sales orders actually shipped out the door in a date range,
        and what left against each one — SHIP events grouped by SO number.
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

      {data &&
        (data.salesOrders.length === 0 ? (
          <p className="text-sm text-zinc-600">No sales orders shipped in this range.</p>
        ) : (
          <div>
            <div className="flex gap-6 mb-5">
              <div>
                <div className="text-2xl font-semibold text-amber-500">
                  {data.totalSalesOrders.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500">sales orders</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{data.totalUnits.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">units shipped</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{data.totalSkus.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">SKUs shipped</div>
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-zinc-900/60 text-left text-xs text-zinc-500">
                    <th className="px-3 py-2 font-medium">SO Number</th>
                    <th className="px-3 py-2 font-medium">Order Date</th>
                    <th className="px-3 py-2 font-medium">Last Shipped</th>
                    <th className="px-3 py-2 font-medium">SKUs</th>
                    <th className="px-3 py-2 font-medium">Total Units</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.salesOrders.map((so) => {
                    const isOpen = expanded.has(so.salesOrderId);
                    return (
                      <Fragment key={so.salesOrderId}>
                        <tr
                          onClick={() => toggle(so.salesOrderId)}
                          className="cursor-pointer hover:bg-zinc-900/40 border-t border-zinc-800"
                        >
                          <td className="px-3 py-2 font-mono">{so.soNumber}</td>
                          <td className="px-3 py-2 text-zinc-400">{formatDateTime24(so.orderDate)}</td>
                          <td className="px-3 py-2 text-zinc-400">{formatDateTime24(so.lastShippedAt)}</td>
                          <td className="px-3 py-2 text-zinc-400">{so.skuCount}</td>
                          <td className="px-3 py-2 font-mono text-amber-500">
                            {so.totalQuantity.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-zinc-500 text-xs">
                            {isOpen ? "▲ Hide" : "▼ Details"}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-zinc-800/60">
                            <td colSpan={6} className="px-3 py-3 bg-zinc-950/40">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-zinc-500">
                                    <th className="px-2 py-1 font-medium">SKU</th>
                                    <th className="px-2 py-1 font-medium">Product</th>
                                    <th className="px-2 py-1 font-medium">Quantity</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {so.lines.map((line) => (
                                    <tr key={line.itemId} className="border-t border-zinc-800/40">
                                      <td className="px-2 py-1 font-mono">{line.itemSku}</td>
                                      <td className="px-2 py-1 text-zinc-400">{line.itemName}</td>
                                      <td className="px-2 py-1 font-mono text-amber-500">
                                        {line.quantity.toLocaleString()}
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
            </div>
          </div>
        ))}
    </div>
  );
}