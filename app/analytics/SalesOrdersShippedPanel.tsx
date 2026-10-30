"use client";

import DateTime24Input from "@/components/DateTime24Input";
import { Fragment, useEffect, useMemo, useState } from "react";
import { formatDateTime24 } from "@/lib/formatDate";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { SO_TYPE_ANALYTICS_LABELS } from "@/lib/salesOrderTypeLabels";
import { formatTruckTime } from "@/app/sales-orders/components/helpers";

type LineItem = {
  itemId: number;
  itemSku: string;
  itemName: string;
  quantity: number;
};

type SalesOrderShipped = {
  salesOrderId: number;
  soNumber: string;
  salesOrderTypeId: number | null;
  salesOrderTypeName: string | null;
  orderDate: string;
  // First pick / last ship, WIB wall-clock strings (lib/truckTimes.ts)
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

type SalesOrderType = { id: number; name: string };

// Checkbox key of an order's type; "none" = older orders with no type.
const NO_TYPE = "none";
const typeKey = (id: number | null) => (id == null ? NO_TYPE : String(id));

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const toLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  return { start: toLocal(start), end: toLocal(end) };
}

// "Time needed" is truck leave minus truck enter — last ship minus first
// pick. "—" if nothing has shipped yet, or the span is zero/negative.
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
  const [types, setTypes] = useState<SalesOrderType[]>([]);
  // Unticked type keys; everything else is shown.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const labels = usePageLabels("analytics", SO_TYPE_ANALYTICS_LABELS);

  useEffect(() => {
    fetch("/api/sales-order-types")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: SalesOrderType[]) => setTypes(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setTypes([]));
  }, []);

  function toggleType(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const typeOptions = useMemo(
    () => [
      ...types.map((t) => ({ key: typeKey(t.id), name: t.name })),
      { key: NO_TYPE, name: labels.no_type },
    ],
    [types, labels.no_type]
  );

  // How many orders of each type the current result has.
  const countByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const so of data?.salesOrders ?? []) {
      const key = typeKey(so.salesOrderTypeId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  // The ticked types' orders, and their totals.
  const view = useMemo(() => {
    if (!data) return null;
    const salesOrders = data.salesOrders.filter((so) => !excluded.has(typeKey(so.salesOrderTypeId)));
    return {
      salesOrders,
      totalSalesOrders: salesOrders.length,
      totalUnits: salesOrders.reduce((sum, so) => sum + so.totalQuantity, 0),
      totalSkus: new Set(salesOrders.flatMap((so) => so.lines.map((l) => l.itemId))).size,
    };
  }, [data, excluded]);

  async function handleFetch() {
    setLoading(true);
    setError(null);
    setExpanded(new Set());

    // Send the raw wall-clock values from the datetime inputs (no UTC
    // conversion) — the truck times are WIB wall-clock too.
    const res = await fetch(
      `/api/analytics/sales-orders-shipped?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    );

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to load sales orders shipped");
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

  const quick =
    "px-2 py-0.5 rounded border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors";

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">{labels.sales_orders_shipped}</h2>
      <p className="text-xs text-zinc-500 mb-4">
        {labels.sales_orders_shipped_description}
      </p>

      <div className="flex items-end gap-3 mb-4 flex-wrap">
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

      {/* Document type checkboxes — filter the result without re-fetching */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-zinc-500">{labels.document_types}</span>
          <button type="button" onClick={() => setExcluded(new Set())} className={quick}>
            {labels.select_all}
          </button>
          <button
            type="button"
            onClick={() => setExcluded(new Set(typeOptions.map((o) => o.key)))}
            className={quick}
          >
            {labels.select_none}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {typeOptions.map((option) => (
            <label
              key={option.key}
              className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={!excluded.has(option.key)}
                onChange={() => toggleType(option.key)}
                className="accent-amber-500"
              />
              <span className={option.key === NO_TYPE ? "text-zinc-500" : "font-mono"}>{option.name}</span>
              {data && (
                <span className="text-xs text-zinc-600">({countByType.get(option.key) ?? 0})</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {data && view &&
        (data.salesOrders.length === 0 ? (
          <p className="text-sm text-zinc-600">{labels.no_sales_orders}</p>
        ) : view.salesOrders.length === 0 ? (
          <p className="text-sm text-zinc-600">{labels.no_sales_orders_for_types}</p>
        ) : (
          <div>
            <div className="flex gap-6 mb-5">
              <div>
                <div className="text-2xl font-semibold text-amber-500">
                  {view.totalSalesOrders.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-500">{labels.sales_orders}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{view.totalUnits.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">{labels.products_shipped}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{view.totalSkus.toLocaleString()}</div>
                <div className="text-xs text-zinc-500">{labels.sku_shipped}</div>
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-zinc-900/60 text-left text-xs text-zinc-500">
                    <th className="px-3 py-2 font-medium">{labels.sales_orders}</th>
                    <th className="px-3 py-2 font-medium">{labels.th_type}</th>
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
                  {view.salesOrders.map((so) => {
                    const isOpen = expanded.has(so.salesOrderId);
                    return (
                      <Fragment key={so.salesOrderId}>
                        <tr
                          onClick={() => toggle(so.salesOrderId)}
                          className="cursor-pointer hover:bg-zinc-900/40 border-t border-zinc-800"
                        >
                          <td className="px-3 py-2 font-mono">{so.soNumber}</td>
                          <td className="px-3 py-2 font-mono text-zinc-400">{so.salesOrderTypeName ?? "—"}</td>
                          <td className="px-3 py-2 text-zinc-400">{formatDateTime24(so.orderDate)}</td>
                          <td className="px-3 py-2 text-zinc-400">{formatTruckTime(so.truckEnterTime)}</td>
                          <td className="px-3 py-2 text-zinc-400">{formatTruckTime(so.truckLeaveTime)}</td>
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
                            <td colSpan={9} className="px-3 py-3 bg-zinc-950/40">
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
