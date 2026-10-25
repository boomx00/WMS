"use client";

import DateTime24Input from "@/components/DateTime24Input";
import { Fragment, useState } from "react";
import { formatDateTime24 } from "@/lib/formatDate";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
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
  truckEnterTime: string | null;
  truckLeaveTime: string | null;
  durationMs: number | null;
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

// "Time needed" is how long the truck was actually at the dock —
// truck_leave_time minus truck_enter_time. "—" if either end isn't
// logged yet, or the recorded span is zero/negative.
function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

export default function SalesOrdersShippedPanel() {
  const initial = defaultRange();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [data, setData] = useState<SalesOrdersShippedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
const labels = usePageLabels("analytics")
  async function handleFetch() {
    setLoading(true);
    setError(null);
    setExpanded(new Set());

    // Send the raw local wall-clock values from the datetime-local inputs
    // (no UTC conversion) — the truck times in the DB are local wall-clock.
    const res = await fetch(
      `/api/analytics/sales-orders-shipped?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
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
      <h2 className="text-sm font-medium mb-1">{labels.sales_orders_shipped}</h2>
      <p className="text-xs text-zinc-500 mb-4">
        {labels.sales_orders_shipped_description}
      </p>

      <div className="flex items-end gap-3 mb-6 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">{labels.from}</label>
          <DateTime24Input value={start} onChange={setStart} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">{labels.to}</label>
          <DateTime24Input value={end} onChange={setEnd} />
        </div>
        <button
          onClick={handleFetch}
          disabled={loading}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading..." : labels.get_data}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {data &&
        (data.salesOrders.length === 0 ? (
          <p className="text-sm text-zinc-600">{labels.no_sales_orders}</p>
        ) : (
          <div>
            <div className="flex gap-6 mb-5">
              <div>
                <div className="text-2xl font-semibold text-amber-500">
                  {data.totalSalesOrders.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500">{labels.sales_orders}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{data.totalUnits.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">{labels.products_shipped}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{data.totalSkus.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">{labels.sku_shipped}</div>
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-zinc-900/60 text-left text-xs text-zinc-500">
                    <th className="px-3 py-2 font-medium">{labels.sales_orders}</th>
                    <th className="px-3 py-2 font-medium">{labels.order_date}</th>
                    <th className="px-3 py-2 font-medium">{labels.truck_enter}</th>
                    <th className="px-3 py-2 font-medium">{labels.truck_leave}</th>
                    <th className="px-3 py-2 font-medium">{labels.time_need}</th>
                    <th className="px-3 py-2 font-medium">SKUs</th>
                    <th className="px-3 py-2 font-medium">{labels.total_carton}</th>
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
                          <td className="px-3 py-2 text-zinc-400">
                            {so.truckEnterTime ? formatDateTime24(so.truckEnterTime) : "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-400">
                            {so.truckLeaveTime ? formatDateTime24(so.truckLeaveTime) : "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-400 font-mono">{formatDuration(so.durationMs)}</td>
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
                            <td colSpan={8} className="px-3 py-3 bg-zinc-950/40">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-zinc-500">
                                    <th className="px-2 py-1 font-medium">SKU</th>
                                    <th className="px-2 py-1 font-medium">{labels.product}</th>
                                    <th className="px-2 py-1 font-medium">{labels.qty}</th>
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