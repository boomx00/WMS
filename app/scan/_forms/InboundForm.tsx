"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { FeedbackBox } from "./FeedbackBox";

export function InboundForm() {
  const router = useRouter();
  const [labelInput, setLabelInput] = useState("");
  const [sku, setSku] = useState("");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
const labels = usePageLabels("scan")
  // Best-effort auto-fill — parses the standard SKU*seq*qty*WO format if it
  // matches, but never blocks submission if it doesn't. Every field below
  // stays manually editable regardless.
  function handleLabelChange(value: string) {
    setLabelInput(value);
    setError(null);
    setSuccess(null);

    const cleaned = value.trim().replace(/^\*+/, "");
    const parts = cleaned.split("*");
    if (parts.length === 4) {
      const [parsedSku, , , parsedWo] = parts;
      if (parsedSku) setSku(parsedSku);
      if (parsedWo) setWorkOrderNumber(parsedWo);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!labelInput || !sku || !workOrderNumber || !quantity) {
      setError("Label, SKU, work order, and quantity are all required.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/pallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: labelInput.trim(),
        sku: sku.trim(),
        workOrderNumber: workOrderNumber.trim(),
        quantity: Number(quantity),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to scan pallet in");
      return;
    }

    setSuccess(`Pallet ${labelInput.trim()} scanned in at Floor.`);
    setLabelInput("");
    setSku("");
    setWorkOrderNumber("");
    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
        <p className="text-xs text-zinc-500">
        {labels.inbound_description}
      </p>
      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.scan_product_label}</label>
        <input
          type="text"
          value={labelInput}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="*14013024102*0021*5000*M0001231"
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">SKU</label>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">{labels.work_order}</label>
          <input
            type="text"
            value={workOrderNumber}
            onChange={(e) => setWorkOrderNumber(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.quantity}</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !labelInput || !sku || !workOrderNumber || !quantity}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Scanning in..." : labels.scan_in_at_floor}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
