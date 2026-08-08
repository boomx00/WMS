"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateItemForm() {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [cartonBagQty, setCartonBagQty] = useState("");
  const [palletCartonQty, setPalletCartonQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        name,
        cartonBagQty: Number(cartonBagQty),
        palletCartonQty: Number(palletCartonQty),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create item");
      return;
    }

    setSku("");
    setName("");
    setCartonBagQty("");
    setPalletCartonQty("");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 flex items-end gap-3 flex-wrap"
    >
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs text-zinc-500 mb-1">SKU</label>
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs text-zinc-500 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <div className="w-32">
        <label className="block text-xs text-zinc-500 mb-1">Bags/Carton</label>
        <input
          type="number"
          min={1}
          value={cartonBagQty}
          onChange={(e) => setCartonBagQty(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <div className="w-32">
        <label className="block text-xs text-zinc-500 mb-1">Cartons/Pallet</label>
        <input
          type="number"
          min={1}
          value={palletCartonQty}
          onChange={(e) => setPalletCartonQty(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Adding..." : "Add item"}
      </button>

      {error && <p className="text-xs text-red-400 w-full">{error}</p>}
    </form>
  );
}