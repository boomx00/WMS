"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackBox } from "./FeedbackBox";

export function ShipForm() {
  const router = useRouter();
  const [soNumber, setSoNumber] = useState("");
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/ship", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soNumber: soNumber.trim(),
        label: label.trim(),
        quantity: Number(quantity),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to ship pallet");
      return;
    }

    const data = await res.json();
    setSuccess(`Shipped ${quantity} units. ${data.remainingOnOrder} remaining on ${soNumber.trim()} for this item.`);
    setLabel("");
    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        Scan the sales order barcode, then the pallet in Outbound Warehouse,
        then enter the quantity per the picking list.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan sales order barcode</label>
        <input
          type="text"
          value={soNumber}
          onChange={(e) => setSoNumber(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quantity per picking list</label>
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
        disabled={loading || !soNumber || !label || !quantity}
        className="px-4 py-2 rounded-md bg-red-600 text-zinc-100 text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
      >
        {loading ? "Shipping..." : "Confirm Ship"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
