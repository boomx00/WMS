"use client";

import { useEffect, useState } from "react";
import { downloadCsv } from "./exportLedgerCsv";

type LedgerEntry = {
  id: number;
  type: string;
  quantity: number;
  itemSku: string;
  itemName: string;
  direction: "IN" | "OUT" | null;
  otherLocationCode: string | null;
  soNumber: string | null;
  tambahanNumber: string | null;
  username: string;
  createdAt: string;
  delta: number;
  runningTotal: number;
};

type LedgerResponse = {
  locationCode: string;
  locationType: string;
  sku: string | null;
  name: string | null;
  anchorOpeningAt: string;
  truncated: boolean;
  rangeFrom: string;
  rangeTo: string | null;
  openingBalance: number;
  closingBalance: number;
  entries: LedgerEntry[];
};

type Query = { sku: string; location: string; from: string; to: string };

function describeEvent(entry: LedgerEntry): string {
  if (entry.soNumber) return `SO ${entry.soNumber}`;
  if (entry.tambahanNumber) return `Tambahan ${entry.tambahanNumber}`;
  if (entry.direction === "IN") return entry.otherLocationCode ? `from ${entry.otherLocationCode}` : "in";
  if (entry.direction === "OUT") return entry.otherLocationCode ? `to ${entry.otherLocationCode}` : "out";
  return "—";
}

export default function LocationLedgerModal({
  sku,
  location,
  onClose,
}: {
  sku: string;
  location: string;
  onClose: () => void;
}) {
  const [skuInput, setSkuInput] = useState(sku);
  const [locationInput, setLocationInput] = useState(location);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [query, setQuery] = useState<Query>({ sku, location, from: "", to: "" });

  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedLocation = query.location.trim();
    if (!trimmedLocation) {
      setData(null);
      setError("Enter a location");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("location", trimmedLocation);
    if (query.sku.trim()) params.set("sku", query.sku.trim());
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);

    fetch(`/api/total-stock/location-ledger?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load ledger");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Failed to load ledger");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  function applyFilters() {
    setQuery({ sku: skuInput, location: locationInput, from: fromInput, to: toInput });
  }

  function clearDates() {
    setFromInput("");
    setToInput("");
    setQuery((prev) => ({ ...prev, from: "", to: "" }));
  }

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [
      ["Opening balance", "", "", "", "", "", data.openingBalance],
      ...data.entries.map((e) => [
        e.createdAt,
        e.type,
        e.itemSku,
        describeEvent(e),
        e.username,
        e.delta,
        e.runningTotal,
      ]),
    ];
    const filename = data.sku ? `${data.locationCode}-${data.sku}-ledger.csv` : `${data.locationCode}-ledger.csv`;
    downloadCsv(filename, ["When", "Type", "SKU", "Detail", "By", "Delta", "Balance"], rows);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-lg w-[90vw] h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">
              {data ? `${data.locationCode}${data.sku ? ` — ${data.sku}` : ""}` : locationInput}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Location ledger — starts from an opening balance, not full history.
              {data && !data.sku && " Showing every SKU that has passed through this location."}
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

        <div className="px-5 pt-4 flex flex-wrap items-end gap-3 shrink-0">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Location</label>
            <input
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500 w-32"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">SKU (optional)</label>
            <input
              type="text"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="All SKUs"
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500 w-36"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">From</label>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">To</label>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={applyFilters}
            className="px-4 py-1.5 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 transition-colors"
          >
            Apply
          </button>

          {(query.from || query.to) && (
            <button
              onClick={clearDates}
              className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              Clear dates
            </button>
          )}

          <button
            onClick={exportCsv}
            disabled={!data}
            className="ml-auto px-4 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-40 transition-colors"
          >
            Export to Excel
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading && <p className="text-sm text-zinc-500">Loading...</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}

          {data && !loading && (
            <>
              <div className="mb-4 text-sm text-zinc-400 space-y-1">
                <div>
                  Opening balance:{" "}
                  <span className="font-mono text-zinc-200">{data.openingBalance.toLocaleString()}</span> as of{" "}
                  <span className="font-mono">{data.rangeFrom}</span>
                </div>
                {data.rangeTo && (
                  <div>
                    Showing through <span className="font-mono">{data.rangeTo}</span>
                  </div>
                )}
                {data.truncated && (
                  <div className="text-amber-500">
                    Ledger only goes back to {data.anchorOpeningAt} — showing from there instead.
                  </div>
                )}
              </div>

              <div className="border border-zinc-800 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 text-zinc-500 text-left">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">Detail</th>
                      <th className="px-3 py-2 font-medium">By</th>
                      <th className="px-3 py-2 font-medium text-right">Δ</th>
                      <th className="px-3 py-2 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-zinc-800 bg-zinc-900/40">
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500" colSpan={5}>
                        Opening balance
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-600">—</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {data.openingBalance.toLocaleString()}
                      </td>
                    </tr>

                    {data.entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-zinc-600">
                          No movement in this range.
                        </td>
                      </tr>
                    ) : (
                      data.entries.map((entry) => (
                        <tr key={entry.id} className="border-t border-zinc-800/70">
                          <td className="px-3 py-2 font-mono text-xs text-zinc-500">{entry.createdAt}</td>
                          <td className="px-3 py-2 text-zinc-300">{entry.type}</td>
                          <td className="px-3 py-2 font-mono text-zinc-400">{entry.itemSku}</td>
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