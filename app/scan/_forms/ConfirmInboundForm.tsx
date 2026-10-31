"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackBox } from "./FeedbackBox";

export function ConfirmInboundForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/confirm-inbound", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), locationCode: locationCode.trim() }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to confirm inbound");
      return;
    }

    setSuccess(`Confirmed ${label.trim()} at ${locationCode.trim()}. Now active stock.`);
    setLabel("");
    setLocationCode("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        Scan a pending pallet's printed label, then scan where you actually
        placed it, to confirm it as real stock.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pending pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan actual location</label>
        <input
          type="text"
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          placeholder="LEFTOVER, DESTROY, or A.1.1"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !label || !locationCode}
        className="px-4 py-2 rounded-md bg-emerald-600 text-zinc-100 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
      >
        {loading ? "Confirming..." : "Confirm Inbound"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
