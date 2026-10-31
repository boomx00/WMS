"use client";

import { useState } from "react";

export function CheckSoForm() {
  const [soNumber, setSoNumber] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    const res = await fetch(`/api/sales-orders/lookup?soNumber=${encodeURIComponent(soNumber.trim())}`);
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to look up sales order");
      return;
    }

    setResult(await res.json());
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={soNumber}
          onChange={(e) => setSoNumber(e.target.value)}
          placeholder="Scan or type SO number"
          autoFocus
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={loading || !soNumber}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Checking..." : "Check"}
        </button>
      </form>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div>
          <div className="text-sm mb-3">
            <span className="font-mono text-amber-500">{result.soNumber}</span>{" "}
            <span className="text-zinc-500">{new Date(result.orderDate).toLocaleDateString()}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-left border-t border-zinc-800 pt-2">
                <th className="py-2 font-medium">SKU</th>
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium text-right">Ordered</th>
                <th className="py-2 font-medium text-right">Shipped</th>
                <th className="py-2 font-medium text-right">Remaining</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((line: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800/60">
                  <td className="py-1.5 font-mono text-zinc-300">{line.itemSku}</td>
                  <td className="py-1.5 text-zinc-500">{line.itemName}</td>
                  <td className="py-1.5 text-right font-mono">{line.quantity.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-mono">{line.shipped.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-mono">{line.remaining.toLocaleString()}</td>
                  <td className="py-1.5">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        line.status === "SHIPPED"
                          ? "bg-emerald-950 text-emerald-300"
                          : line.status === "PICKING"
                          ? "bg-amber-950 text-amber-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {line.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
