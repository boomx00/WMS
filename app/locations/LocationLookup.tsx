"use client";

import { useState } from "react";

type Pallet = {
  id: number;
  label: string;
  quantity: number;
  workOrderNumber: string;
  status: string;
};

export default function LocationLookup() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{
    location: { code: string; type: string } | null;
    pallets: Pallet[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResult(null);

    const res = await fetch(
      `/api/locations/lookup?code=${encodeURIComponent(code)}`
    );

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Location not found");
      return;
    }

    const data = await res.json();
    setResult(data);
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. A.1.1 or FLOOR"
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md bg-zinc-800 text-zinc-100 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {result && (
        <div className="mt-4 border border-zinc-800 rounded-lg p-4 bg-zinc-900/30">
          <div className="text-sm mb-3">
            <span className="font-mono text-amber-500">
              {result.location?.code}
            </span>{" "}
            <span className="text-zinc-500">({result.location?.type})</span>
          </div>

          {result.pallets.length === 0 ? (
            <p className="text-xs text-zinc-600">
              No active pallets at this location.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-left">
                  <th className="pb-1">Label</th>
                  <th className="pb-1">Work Order</th>
                  <th className="pb-1 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {result.pallets.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-800/50">
                    <td className="py-1.5 font-mono">{p.label}</td>
                    <td className="py-1.5 font-mono text-zinc-400">
                      {p.workOrderNumber}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {p.quantity.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}