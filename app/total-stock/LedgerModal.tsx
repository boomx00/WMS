"use client";

import { useEffect, useState } from "react";

type LedgerEntry = {
  id: number;
  type: string;
  quantity: number;
  sourceCode: string | null;
  destinationCode: string | null;
  soNumber: string | null;
  tambahanNumber: string | null;
  username: string;
  createdAt: string;
  delta: number;
  runningTotal: number;
};

type LedgerResponse = {
  sku: string;
  name: string;
  openingQuantity: number;
  openingAt: string;
  currentTotal: number;
  entries: LedgerEntry[];
};

function describeEvent(entry: LedgerEntry): string {
  if (entry.soNumber) return `SO ${entry.soNumber}`;
  if (entry.tambahanNumber) return `Tambahan ${entry.tambahanNumber}`;
  if (entry.sourceCode && entry.destinationCode) return `${entry.sourceCode} → ${entry.destinationCode}`;
  if (entry.destinationCode) return `→ ${entry.destinationCode}`;
  if (entry.sourceCode) return `${entry.sourceCode} →`;
  return "—";
}

export default function LedgerModal({ sku, onClose }: { sku: string; onClose: () => void }) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/total-stock/${encodeURIComponent(sku)}/ledger`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load ledger");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load ledger");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sku]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-3xl mt-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">{data ? `${data.sku} — ${data.name}` : sku}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Movement ledger — starts from the opening balance below, not full history.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {loading && <p className="text-sm text-zinc-500">Loading...</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}

          {data && (
            <>
              <div className="mb-4 text-sm text-zinc-400">
                Opening balance:{" "}
                <span className="font-mono text-zinc-200">{data.openingQuantity.toLocaleString()}</span> as of{" "}
                <span className="font-mono">{data.openingAt}</span>
              </div>

              <div className="border border-zinc-800 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-500 text-left">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 font-medium">By</th>
                      <th className="px-3 py-2 font-medium text-right">Δ</th>
                      <th className="px-3 py-2 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-zinc-800 bg-zinc-900/40">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500" colSpan={4}>
                        Opening balance
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-600">—</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {data.openingQuantity.toLocaleString()}
                      </td>
                    </tr>

                    {data.entries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-zinc-600">
                          No movement since the opening balance.
                        </td>
                      </tr>
                    ) : (
                      data.entries.map((entry) => (
                        <tr key={entry.id} className="border-t border-zinc-800/70">
                          <td className="px-3 py-2 font-mono text-xs text-zinc-500">{entry.createdAt}</td>
                          <td className="px-3 py-2 text-zinc-300">{entry.type}</td>
                          <td className="px-3 py-2 text-zinc-400">{describeEvent(entry)}</td>
                          <td className="px-3 py-2 text-zinc-400">{entry.username}</td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${
                              entry.delta > 0
                                ? "text-emerald-400"
                                : entry.delta < 0
                                  ? "text-red-400"
                                  : "text-zinc-600"
                            }`}
                          >
                            {entry.delta > 0 ? "+" : ""}
                            {entry.delta.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {entry.runningTotal.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}