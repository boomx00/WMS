"use client";

import { useMemo, useState } from "react";

type Row = {
  palletId: number;
  label: string;
  quantity: number;
  workOrderNumber: string;
  status: string;
  itemSku: string;
  itemName: string;
  currentLocationCode: string;
  currentLocationType: string;
  inboundAt: string | Date | null;
  firstRackedAt: string | Date | null;
  removedAt: string | Date | null;
  inboundByUsername: string;
  rackedByUsername: string | null;
  removedByUsername: string | null;
};

function fmt(date: string | Date | null) {
  if (!date) return <span className="text-zinc-700">—</span>;
  const d = new Date(date);
  return (
    <span>
      {d.toLocaleDateString()}{" "}
      <span className="text-zinc-600">{d.toLocaleTimeString()}</span>
    </span>
  );
}

function fmtWithUser(date: string | Date | null, username: string | null) {
  if (!date) return <span className="text-zinc-700">—</span>;
  return (
    <div>
      {fmt(date)}
      {username && (
        <div className="text-zinc-500 text-[11px] mt-0.5">by {username}</div>
      )}
    </div>
  );
}

export default function PalletsTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;

      if (!q) return true;

      return (
        row.label.toLowerCase().includes(q) ||
        row.itemSku.toLowerCase().includes(q) ||
        row.itemName.toLowerCase().includes(q) ||
        row.workOrderNumber.toLowerCase().includes(q) ||
        row.currentLocationCode.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by label, SKU, product, work order, or location..."
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="REMOVED">Removed</option>
        </select>
      </div>

      <p className="text-xs text-zinc-600 mb-3">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} pallets
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left whitespace-nowrap">
              <th className="px-4 py-3 font-medium">Pallet</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Inbound</th>
              <th className="px-4 py-3 font-medium">First Racked</th>
              <th className="px-4 py-3 font-medium">Removed</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-600">
                  No matching pallets.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.palletId}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50 whitespace-nowrap"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                    {row.label}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-zinc-300">{row.itemSku}</span>{" "}
                    <span className="text-zinc-500 text-xs">{row.itemName}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {row.quantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-amber-500">
                    {row.currentLocationCode}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        row.status === "ACTIVE"
                          ? "bg-emerald-950 text-emerald-300"
                          : "bg-red-950 text-red-300"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
  {fmtWithUser(row.inboundAt, row.inboundByUsername)}
</td>
<td className="px-4 py-3 text-xs text-zinc-500">
  {fmtWithUser(row.firstRackedAt, row.rackedByUsername)}
</td>
<td className="px-4 py-3 text-xs text-zinc-500">
  {fmtWithUser(row.removedAt, row.removedByUsername)}
</td>
<td className="px-4 py-3">
  {row.status === "PENDING" && (
    <a
      href={`/pallets/print/${encodeURIComponent(row.label)}`}
      target="_blank"
      className="text-xs text-amber-500 hover:underline whitespace-nowrap"
    >
      Print Label
    </a>
  )}
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