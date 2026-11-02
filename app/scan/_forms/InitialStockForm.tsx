"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackBox } from "./FeedbackBox";

export function InitialStockForm() {
  const router = useRouter();
  const [defaultCode, setDefaultCode] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/initial-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultCode: defaultCode.trim(),
        locationCode: locationCode.trim(),
        quantity: Number(quantity),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to record initial stock");
      return;
    }

    setSuccess(`Recorded ${quantity} units at ${locationCode.trim()}.`);
    setDefaultCode("");
    setLocationCode("");
    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        For stock that already existed before scanning was in place. Uses the
        item&apos;s default code instead of a real pallet label.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Default code</label>
        <input
          type="text"
          value={defaultCode}
          onChange={(e) => setDefaultCode(e.target.value)}
          placeholder="14013024102*default"
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Location</label>
        <input
          type="text"
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          placeholder="A.1.1"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quantity in this cell</label>
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
        disabled={loading || !defaultCode || !locationCode || !quantity}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Recording..." : "Record stock"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
