"use client";

import { useMemo, useState } from "react";

type Row = {
  id: number;
  locationCode: string;
  locationType: string;
  itemSku: string;
  itemName: string;
  quantity: number;
  updatedAt: string | Date;
};

export default function LocationStockTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.locationCode.toLowerCase().includes(q) ||
        r.itemSku.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by location or SKU..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm mb-4 focus:outline-none focus:border-amber-500"
      />

      <p className="text-xs text-zinc-600 mb-3">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium text-right">Quantity</th>
              <th className="px-4 py-3 font-medium text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                  No stock recorded yet.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <span className="font-mono text-amber-500">{row.locationCode}</span>
                    {row.locationType !== "RACK" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {row.locationType}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">{row.itemSku}</td>
                  <td className="px-4 py-3 text-zinc-500">{row.itemName}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.quantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                    {new Date(row.updatedAt).toLocaleString()}
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