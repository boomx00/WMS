"use client";

import { useMemo, useState } from "react";

type Pallet = {
  palletId: number;
  label: string;
  quantity: number;
  workOrderNumber: string;
  itemSku: string;
  itemName: string;
};

type Row = {
  locationId: number;
  code: string;
  type: string;
  area: string | null;
  x: number | null;
  y: number | null;
  pallets: Pallet[];
};

export default function RackContentsTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [occupiedOnly, setOccupiedOnly] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (occupiedOnly && row.pallets.length === 0) return false;

      if (!q) return true;

      const matchesLocation = row.code.toLowerCase().includes(q);
      const matchesProduct = row.pallets.some(
        (p) =>
          p.itemSku.toLowerCase().includes(q) ||
          p.itemName.toLowerCase().includes(q) ||
          p.workOrderNumber.toLowerCase().includes(q)
      );

      return matchesLocation || matchesProduct;
    });
  }, [rows, search, occupiedOnly]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by location, SKU, product, or work order..."
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-400 whitespace-nowrap">
          <input
            type="checkbox"
            checked={occupiedOnly}
            onChange={(e) => setOccupiedOnly(e.target.checked)}
            className="accent-amber-500"
          />
          Occupied only
        </label>
      </div>

      <p className="text-xs text-zinc-600 mb-3">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} locations
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Products</th>
              <th className="px-4 py-3 font-medium text-right">Total Units</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-600">
                  No matching locations.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.locationId}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50 align-top"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
  <span className="font-mono text-amber-500">{row.code}</span>
  {row.type !== "RACK" && (
    <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
      {row.type}
    </span>
  )}
</td>
                  <td className="px-4 py-3">
                    {row.pallets.length === 0 ? (
  <span className="text-zinc-600 text-xs">Empty</span>
) : (
  <div className="space-y-1">
    {row.pallets.map((p) => (
      <div key={p.palletId} className="text-xs">
        <div className="font-mono text-zinc-400">{p.label}</div>
        <div>
          <span className="font-mono text-zinc-300">{p.itemSku}</span>{" "}
          <span className="text-zinc-500">
            {p.itemName} · {p.quantity.toLocaleString()} units · WO{" "}
            {p.workOrderNumber}
          </span>
        </div>
      </div>
    ))}
  </div>
)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.pallets
                      .reduce((sum, p) => sum + p.quantity, 0)
                      .toLocaleString()}
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