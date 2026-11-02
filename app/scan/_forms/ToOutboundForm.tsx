"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackBox } from "./FeedbackBox";

// Not shown on any tab at the moment.

export function ToOutboundForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [currentLocationCode, setCurrentLocationCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [needsQuantity, setNeedsQuantity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        currentLocationCode: currentLocationCode.trim(),
        newLocationCode: "OUTBOUND_WH",
        quantity: quantity ? Number(quantity) : undefined,
      }),
    });
    setLoading(false);

    const data = await res.json();

    if (!res.ok) {
      if (data.matchType === "default_needs_quantity" || data.matchType === "auto_inbound_needs_quantity") {
        setNeedsQuantity(true);
        setError(data.availableQuantity ? `${data.error} (${data.availableQuantity} available)` : data.error);
      } else {
        setError(data.error ?? "Failed to move to Outbound Warehouse");
      }
      return;
    }

    setSuccess(`Moved ${label.trim()} to Outbound Warehouse.`);
    setLabel("");
    setCurrentLocationCode("");
    setQuantity("");
    setNeedsQuantity(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan current location</label>
        <input
          type="text"
          value={currentLocationCode}
          onChange={(e) => setCurrentLocationCode(e.target.value)}
          placeholder="A.1.1 or FLOOR"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      {needsQuantity && (
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-amber-700 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !label || !currentLocationCode}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Moving..." : "Move to Outbound"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
