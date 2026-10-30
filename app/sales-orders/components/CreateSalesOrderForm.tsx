"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ItemPicker from "./ItemPicker";
import type { ItemOption, SalesOrderTypeOption } from "./types";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { SO_TYPE_SALES_PAGE_LABELS } from "@/lib/salesOrderTypeLabels";

export default function CreateSalesOrderForm({
  allItems,
  salesOrderTypes,
}: {
  allItems: ItemOption[];
  salesOrderTypes: SalesOrderTypeOption[];
}) {
  const router = useRouter();
  // Kept after creating, so a run of the same type doesn't need re-choosing.
  const [salesOrderTypeId, setSalesOrderTypeId] = useState("");
  const [soNumber, setSoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<{ sku: string; quantity: string }[]>([
    { sku: "", quantity: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const labels = usePageLabels("sales_page", SO_TYPE_SALES_PAGE_LABELS)
  const noTypes = salesOrderTypes.length === 0
  // The chosen type's fixed number start ("SO/MDE-"): only the rest is typed.
  const prefix = salesOrderTypes.find((t) => String(t.id) === salesOrderTypeId)?.numberPrefix ?? ""
  // A pasted full number that already starts with the prefix isn't doubled.
  const typed = soNumber.trim()
  const fullSoNumber = !typed
    ? ""
    : prefix && typed.toLowerCase().startsWith(prefix.toLowerCase())
    ? typed
    : `${prefix}${typed}`
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
    setSuccess(null);

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
    const res = await fetch("/api/sales-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soNumber: fullSoNumber,
        salesOrderTypeId: Number(salesOrderTypeId),
        orderDate,
        items: mergedLines,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create sales order");
      return;
    }

    setSuccess(`Created sales order ${fullSoNumber}.`);
    setSoNumber("");
    setLines([{ sku: "", quantity: "" }]);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">{labels.document_type}</label>
          <select
            value={salesOrderTypeId}
            onChange={(e) => setSalesOrderTypeId(e.target.value)}
            disabled={noTypes}
            className="min-w-36 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
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
          <label className="block text-xs text-zinc-500 mb-1">
            {prefix ? labels.number_after_prefix : labels.so_number}
          </label>
          <div className="flex rounded-md bg-zinc-900 border border-zinc-800 focus-within:border-amber-500">
            {prefix && (
              <span className="px-3 py-2 text-sm font-mono text-zinc-400 border-r border-zinc-800 whitespace-pre select-none">
                {prefix}
              </span>
            )}
            <input
              type="text"
              placeholder={prefix ? "0001" : "SO/MDE-0001"}
              value={soNumber}
              onChange={(e) => setSoNumber(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono focus:outline-none"
              required
            />
          </div>
          {prefix && fullSoNumber && (
            <p className="mt-1 text-[11px] text-zinc-500 font-mono">
              {labels.so_number_preview.replace("{so}", fullSoNumber)}
            </p>
          )}
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
        <div className="space-y-2">
         {lines.map((line, i) => (
  <div key={i} className="flex gap-2 items-end">
    <ItemPicker
      allItems={allItems}
      value={line.sku}
      onChange={(sku) => updateLine(i, "sku", sku)}
    />
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{labels.qty}</span>
      <input
        type="number"
        min={1}
        placeholder=""
        value={line.quantity}
        onChange={(e) => updateLine(i, "quantity", e.target.value)}
        className="w-24 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
      />
    </label>
    {lines.length > 1 && (
      <button
        type="button"
        onClick={() => removeLine(i)}
        className="px-3 py-2 text-zinc-500 hover:text-red-400 text-sm"
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
          + {labels.add_item}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading || !soNumber || !salesOrderTypeId}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? labels.creating : labels.create_sales_order}
      </button>

      {noTypes && <p className="text-xs text-amber-400">{labels.no_document_types}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}
    </form>
  );
}