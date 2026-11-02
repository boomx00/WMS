"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { FeedbackBox } from "./FeedbackBox";

export function CorrectQtyForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const labels = usePageLabels("scan")
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/correct-quantity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        newQuantity: Number(newQuantity),
        reason: reason.trim(),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to correct quantity");
      return;
    }

    const data = await res.json();
    const sign = data.delta > 0 ? "+" : "";
    setSuccess(`Corrected ${label.trim()}: ${data.previousQuantity} → ${data.quantity} (${sign}${data.delta})`);
    setLabel("");
    setNewQuantity("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        {labels.adjust_pallet_qty_description}
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.scan_product_label}</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.corrected_quantity}</label>
        <input
          type="number"
          min={0}
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">{labels.reason}</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Mistyped quantity during Inbound"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !label || newQuantity === ""}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Correcting..." : labels.apply_adjustment}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
