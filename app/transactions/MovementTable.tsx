"use client";

import { useMemo, useState } from "react";

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

const TYPE_STYLES: Record<string, string> = {
  INBOUND: "bg-blue-950 text-blue-300",
  MOVED: "bg-amber-950 text-amber-300",
  REMOVED: "bg-red-950 text-red-300",
  NEVER_INBOUNDED: "bg-purple-950 text-purple-300",
};

const TYPE_LABELS: Record<string, string> = {
  INBOUND: "INBOUND",
  MOVED: "MOVED",
  REMOVED: "OUTBOUND",
  NEVER_INBOUNDED: "OUTBOUND · NEVER INBOUNDED",
};

export default function MovementTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (typeFilter !== "ALL" && row.type !== typeFilter) return false;

      if (!q) return true;

      return (
        row.locationCode.toLowerCase().includes(q) ||
        row.palletLabel.toLowerCase().includes(q) ||
        row.itemSku.toLowerCase().includes(q) ||
        row.itemName.toLowerCase().includes(q) ||
        row.workOrderNumber.toLowerCase().includes(q) ||
        row.username.toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by location, SKU, product, work order, or user..."
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
        <select
  value={typeFilter}
  onChange={(e) => setTypeFilter(e.target.value)}
  className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
>
  <option value="ALL">All types</option>
  <option value="INBOUND">Inbound</option>
  <option value="MOVED">Moved</option>
  <option value="REMOVED">Removed</option>
  <option value="NEVER_INBOUNDED">Never Inbounded</option>
</select>
      </div>

      <p className="text-xs text-zinc-600 mb-3">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} events
        (most recent 500 shown)
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                  No matching events.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.eventId}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        TYPE_STYLES[row.type] ?? "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {TYPE_LABELS[row.type] ?? row.type}
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