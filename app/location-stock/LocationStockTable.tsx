"use client";

import { useMemo, useState } from "react";

type Row = {
  id: number;
  locationCode: string;
  locationType: string;
  itemSku: string;
  itemName: string;
  quantity: number;
  palletQuantity: number,
  updatedAt: string | Date;
};
const formatPallet = (value: number | string) => {
  const num = Number(value);

  return Number.isInteger(num)
    ? num.toString()
    : num.toFixed(2).replace(/\.?0+$/, "");
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
              {/* <th className="px-4 py-3 font-medium text-right">Pallet</th> */}
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
                  <OutboundRow key={row.id} row={row} />

              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type BreakdownResponse = {
  itemSku: string;
  itemName: string;
  totalInOutboundWh: number;
  unmarked: number;
  markedBySo: { salesOrderId: number; soNumber: string; quantity: number }[];
};

function OutboundRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const isOutboundWh = row.locationType === "OUTBOUND_WH";

  async function toggle() {
    if (!isOutboundWh) return;
    if (!open && !breakdown) {
      setLoading(true);
      const res = await fetch(`/api/location-stock/outbound-breakdown?sku=${encodeURIComponent(row.itemSku)}`);
      if (res.ok) setBreakdown(await res.json());
      setLoading(false);
    }
    setOpen((prev) => !prev);
  }

  return (
    <>
      <tr
        className={`border-t border-zinc-800 hover:bg-zinc-900/50 ${isOutboundWh ? "cursor-pointer" : ""}`}
        onClick={toggle}
      >
        <td className="px-4 py-3">
          {isOutboundWh && (
            <span className={`text-zinc-500 text-xs mr-1 inline-block transition-transform ${open ? "rotate-90" : ""}`}>
              ▶
            </span>
          )}
          <span className="font-mono text-amber-500">{row.locationCode}</span>
          {row.locationType !== "RACK" && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {row.locationType}
            </span>
          )}
        </td>
        <td className="px-4 py-3 font-mono text-zinc-300">{row.itemSku}</td>
        <td className="px-4 py-3 text-zinc-500">{row.itemName}</td>
        <td className="px-4 py-3 text-right font-mono">{row.quantity.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-zinc-500 text-xs">
          {new Date(row.updatedAt).toLocaleString()}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-zinc-800/60 bg-zinc-950/40">
          <td colSpan={5} className="px-4 py-4">
            {loading ? (
              <p className="text-xs text-zinc-600">Loading...</p>
            ) : !breakdown ? (
              <p className="text-xs text-red-400">Failed to load breakdown</p>
            ) : (
              <BreakdownDetail breakdown={breakdown} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function BreakdownDetail({ breakdown: initial }: { breakdown: BreakdownResponse }) {
  const [breakdown, setBreakdown] = useState(initial);

  async function refresh() {
    const res = await fetch(`/api/location-stock/outbound-breakdown?sku=${encodeURIComponent(breakdown.itemSku)}`);
    if (res.ok) setBreakdown(await res.json());
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-6 text-xs">
        <span className="text-zinc-500">
          Total: <span className="text-zinc-200 font-mono">{breakdown.totalInOutboundWh}</span>
        </span>
        <span className="text-zinc-500">
          Unmarked (ecer): <span className="text-amber-400 font-mono">{breakdown.unmarked}</span>
        </span>
      </div>

      {breakdown.markedBySo.length === 0 ? (
        <p className="text-xs text-zinc-600">Nothing marked to any SO yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left">
              <th className="py-1 font-medium">SO Number</th>
              <th className="py-1 font-medium text-right">Marked Qty</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {breakdown.markedBySo.map((m) => (
              <CorrectableRow
                key={m.salesOrderId}
                itemSku={breakdown.itemSku}
                soNumber={m.soNumber}
                quantity={m.quantity}
                onSaved={refresh}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CorrectableRow({
  itemSku,
  soNumber,
  quantity,
  onSaved,
}: {
  itemSku: string;
  soNumber: string;
  quantity: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(quantity.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/location-stock/outbound-breakdown/correct", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemSku, soNumber, newQuantity: Number(value) }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to correct");
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <tr className="border-t border-zinc-800/60">
      <td className="py-1.5 font-mono text-amber-500">{soNumber}</td>
      <td className="py-1.5 text-right font-mono">
        {editing ? (
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-xs font-mono text-right focus:outline-none"
          />
        ) : (
          quantity
        )}
      </td>
      <td className="py-1.5 text-right">
        {editing ? (
          <div className="flex gap-2 justify-end items-center">
            {error && <span className="text-red-400">{error}</span>}
            <button onClick={save} disabled={saving} className="text-amber-500 hover:underline">
              {saving ? "..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="text-zinc-500 hover:underline">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-amber-500 hover:underline">
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}