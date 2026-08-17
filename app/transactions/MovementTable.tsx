"use client";

import { useEffect, useMemo, useState } from "react";
import { EVENT_TYPE_STYLES, EVENT_TYPE_LABELS } from "@/lib/eventTypes";

type Row = {
  eventId: number;
  type: string;
  createdAt: string | Date;
  locationCode: string;
  palletLabel: string;
  workOrderNumber: string;
  quantity: number;
  itemSku: string;
  itemName: string;
  username: string;
};

export default function MovementTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }

    const handle = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(
        `/api/transactions/search?q=${encodeURIComponent(search.trim())}&type=INBOUND`
      );
      setSearching(false);
      if (res.ok) {
        setSearchResults(await res.json());
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [search]);

  const displayRows = searchResults ?? rows;

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by label, SKU, product, work order, location, or user..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm mb-4 focus:outline-none focus:border-amber-500"
      />

      <p className="text-xs text-zinc-600 mb-3">
        {searching
          ? "Searching..."
          : searchResults !== null
          ? `${displayRows.length.toLocaleString()} result(s) for "${search.trim()}"`
          : `Showing ${displayRows.length.toLocaleString()} most recent inbound events`}
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                  No matching events.
                </td>
              </tr>
            ) : (
              displayRows.map((row) => (
                <tr
                  key={row.eventId}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        EVENT_TYPE_STYLES[row.type] ?? "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {EVENT_TYPE_LABELS[row.type] ?? row.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {row.palletLabel}
                  </td>
                  <td className="px-4 py-3 font-mono text-amber-500 whitespace-nowrap">
                    {row.locationCode}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      <span className="font-mono text-zinc-300">{row.itemSku}</span>{" "}
                      <span className="text-zinc-500">
                        {row.itemName} · WO {row.workOrderNumber}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.quantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{row.username}</td>
                  <td className="px-4 py-3 text-right text-zinc-500 text-xs whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}