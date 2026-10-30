"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ItemPicker from "./ItemPicker";
import type { ItemOption, Order, SalesOrderTypeOption } from "./types";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { SO_TYPE_SALES_PAGE_LABELS } from "@/lib/salesOrderTypeLabels";

export default function EditSalesOrderForm({
  order,
  allItems,
  salesOrderTypes,
  onDone,
}: {
  order: Order;
  allItems: ItemOption[];
  salesOrderTypes: SalesOrderTypeOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const labels = usePageLabels("sales_page", SO_TYPE_SALES_PAGE_LABELS);
  // Older orders have no type yet — saving one makes you choose.
  const [salesOrderTypeId, setSalesOrderTypeId] = useState(
    order.salesOrderTypeId != null ? String(order.salesOrderTypeId) : ""
  );
  const [soNumber, setSoNumber] = useState(order.soNumber);
  const [orderDate, setOrderDate] = useState(
    new Date(order.orderDate).toISOString().slice(0, 10)
  );
  const [lines, setLines] = useState(
    order.items.map((l) => ({ sku: l.itemSku, quantity: String(l.quantity) }))
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateLine(index: number, field: "sku" | "quantity", value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { sku: "", quantity: "" }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!salesOrderTypeId) {
      setError(labels.choose_document_type);
      return;
    }

    const validLines = lines.filter((l) => l.sku && l.quantity);
    if (validLines.length === 0) {
      setError("Add at least one item with a SKU and quantity");
      return;
    }

    const merged = new Map<string, number>();
    for (const l of validLines) {
      merged.set(l.sku, (merged.get(l.sku) ?? 0) + Number(l.quantity));
    }
    const mergedLines = Array.from(merged.entries()).map(([sku, quantity]) => ({ sku, quantity }));

    setLoading(true);
    const res = await fetch(`/api/sales-orders/${order.soNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soNumber,
        salesOrderTypeId: Number(salesOrderTypeId),
        orderDate,
        items: mergedLines,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to update sales order");
      return;
    }

    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">{labels.document_type}</label>
          <select
            value={salesOrderTypeId}
            onChange={(e) => setSalesOrderTypeId(e.target.value)}
            className="min-w-36 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
            required
          >
            <option value="">{labels.choose_document_type}</option>
            {salesOrderTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description ? `${t.name} — ${t.description}` : t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-zinc-500 mb-1">{labels.so_number}</label>
          <input
            type="text"
            value={soNumber}
            onChange={(e) => setSoNumber(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">{labels.date}</label>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-2">Items</label>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <ItemPicker
                allItems={allItems}
                value={line.sku}
                onChange={(sku) => updateLine(i, "sku", sku)}
              />
              <input
                type="number"
                min={1}
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => updateLine(i, "quantity", e.target.value)}
                className="w-24 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="px-3 text-zinc-500 hover:text-red-400 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-2 text-xs text-amber-500 hover:underline"
        >
          + Add item
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !soNumber || !salesOrderTypeId}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? labels.saving : labels.save_changes}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 rounded-md border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-900 transition-colors"
        >
          {labels.cancel}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}