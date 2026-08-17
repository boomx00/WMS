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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (occupiedOnly && row.pallets.length === 0) return false;

      if (!q) return true;

      const matchesLocation = row.code.toLowerCase().includes(q);
     const matchesProduct = row.pallets.some(
  (p) =>
    p.label.toLowerCase().includes(q) ||
    p.itemSku.toLowerCase().includes(q) ||
    p.itemName.toLowerCase().includes(q) ||
    p.workOrderNumber.toLowerCase().includes(q)
);

      return matchesLocation || matchesProduct;
    });
  }, [rows, search, occupiedOnly]);

  function toggle(locationId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  }

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
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-zinc-600 text-sm">
            No matching locations.
          </div>
        ) : (
          filtered.map((row) => {
            const isOpen = expanded.has(row.locationId);
            const totalUnits = row.pallets.reduce((sum, p) => sum + p.quantity, 0);

            return (
              <div key={row.locationId} className="border-b border-zinc-800 last:border-b-0">
                <button
                  onClick={() => toggle(row.locationId)}
                  disabled={row.pallets.length === 0}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    row.pallets.length > 0 ? "hover:bg-zinc-900/50" : "cursor-default"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {row.pallets.length > 0 && (
                      <span
                        className={`text-zinc-500 text-xs transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      >
                        ▶
                      </span>
                    )}
                    <span className="font-mono text-amber-500">{row.code}</span>
                    {row.type !== "RACK" && (
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                        {row.type}
                      </span>
                    )}
                  </span>

                  <span className="text-xs text-zinc-500 whitespace-nowrap">
                    {row.pallets.length === 0 ? (
                      "Empty"
                    ) : (
                      <>
                        {row.pallets.length} pallet(s) ·{" "}
                        <span className="font-mono text-zinc-300">
                          {totalUnits.toLocaleString()}
                        </span>{" "}
                        units
                      </>
                    )}
                  </span>
                </button>

                {isOpen && row.pallets.length > 0 && (
  <div className="bg-zinc-950/40 border-t border-zinc-800">
    <table className="w-full text-xs">
      <thead>
        <tr className="text-zinc-600 text-left">
          <th className="px-4 py-2 font-medium">Label</th>
          <th className="px-4 py-2 font-medium">SKU</th>
          <th className="px-4 py-2 font-medium">Product</th>
          <th className="px-4 py-2 font-medium">Work Order</th>
          <th className="px-4 py-2 font-medium text-right">Qty</th>
        </tr>
      </thead>
      <tbody>
        {row.pallets.map((p) => (
          <tr key={p.palletId} className="border-t border-zinc-800/60">
            <td className="px-4 py-1.5 font-mono text-zinc-400">{p.label}</td>
            <td className="px-4 py-1.5 font-mono text-zinc-300">{p.itemSku}</td>
            <td className="px-4 py-1.5 text-zinc-500">{p.itemName}</td>
            <td className="px-4 py-1.5 font-mono text-zinc-500">{p.workOrderNumber}</td>
            <td className="px-4 py-1.5 text-right font-mono">{p.quantity.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}