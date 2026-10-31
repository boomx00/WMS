"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeedbackBox } from "./FeedbackBox";

// Not shown on any tab at the moment.

export function SplitForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [splitQuantity, setSplitQuantity] = useState("");
  const [newLocationCode, setNewLocationCode] = useState("LEFTOVER");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        splitQuantity: Number(splitQuantity),
        newLocationCode: newLocationCode.trim(),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to split pallet");
      return;
    }

    const data = await res.json();
    setSuccess(`Split ${splitQuantity} units to ${newLocationCode} as ${data.split.label}`);
    setLabel("");
    setSplitQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan/enter original pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="14013024102*0021*5000*M0006995"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quantity to split off</label>
        <input
          type="number"
          min={1}
          value={splitQuantity}
          onChange={(e) => setSplitQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Destination</label>
        <select
          value={newLocationCode}
          onChange={(e) => setNewLocationCode(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="LEFTOVER">Leftover</option>
          <option value="DESTROY">Destroy</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading || !label || !splitQuantity}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Splitting..." : "Split pallet"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
