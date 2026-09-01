"use client";

import { useState } from "react";

type ShippedProduct = {
  itemId: number;
  itemSku: string;
  itemName: string;
  totalQuantity: number;
  shipmentCount: number;
  orderCount: number;
};

type ShippedProductsResponse = {
  totalQuantity: number;
  totalOrders: number;
  totalSkus: number;
  products: ShippedProduct[];
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

export default function ShippedProductsPanel() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState<ShippedProductsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setLoading(true);
    setError(null);

    const startIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();

    const res = await fetch(
      `/api/analytics/shipped-products?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
    );

    setLoading(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to load shipped products");
      return;
    }

    setData(await res.json());
  }

  const maxQty = data && data.products.length > 0 ? Math.max(...data.products.map((p) => p.totalQuantity), 1) : 1;

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">Products Shipped (v2)</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Units that actually left the warehouse — location_stock SHIP
        events against sales orders, broken down by product.
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
        (data.products.length === 0 ? (
          <p className="text-sm text-zinc-600">No shipments in this range.</p>
        ) : (
          <div>
            <div className="flex gap-6 mb-5">
              <div>
                <div className="text-2xl font-semibold text-amber-500">
                  {data.totalQuantity.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500">units shipped</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{data.totalOrders.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">sales orders</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{data.totalSkus.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">SKUs shipped</div>
              </div>
            </div>

            <div className="space-y-3">
              {data.products.map((p) => (
                <div key={p.itemId}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm text-zinc-300">
                      <span className="font-mono">{p.itemSku}</span>{" "}
                      <span className="text-zinc-500">{p.itemName}</span>
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {p.totalQuantity.toLocaleString()} unit(s) · {p.orderCount.toLocaleString()} order(s)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${(p.totalQuantity / maxQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}