"use client";

import { useEffect, useState } from "react";

type TambahanItem = {
  itemId: number;
  itemSku: string;
  itemName: string;
  pickedQty: number;
  shippedQty: number;
};

type TambahanData = {
  tambahan: {
    id: number;
    tambahanNumber: string;
    status: "ACTIVE" | "CONVERTED";
    convertedSoNumber: string | null;
    convertedAt: string | null;
    createdAt: string;
  } | null;
  items: TambahanItem[];
};

export default function TambahanPanel({ soNumber }: { soNumber: string }) {
  const [data, setData] = useState<TambahanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSoNumber, setNewSoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  async function refresh() {
    setLoading(true);
    const res = await fetch(`/api/sales-orders/${encodeURIComponent(soNumber)}/tambahan`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soNumber]);

  async function handleConvert() {
    setError(null);
    if (!newSoNumber.trim()) {
      setError("Enter the real SO number first");
      return;
    }
    setConverting(true);
    const res = await fetch(`/api/sales-orders/${encodeURIComponent(soNumber)}/tambahan/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newSoNumber: newSoNumber.trim(), orderDate }),
    });
    setConverting(false);
    if (!res.ok) {
      const responseBody = await res.json();
      setError(responseBody.error ?? "Failed to convert");
      return;
    }
    await refresh();
  }
    async function handleConfirmTambahan() {
    setError(null);
    setConfirming(true);
    const res = await fetch(`/api/sales-orders/${encodeURIComponent(soNumber)}/tambahan/confirm`, {
      method: "POST",
    });
    setConfirming(false);
    if (!res.ok) {
      const responseBody = await res.json();
      setError(responseBody.error ?? "Failed to confirm");
      return;
    }
    await refresh();
  }

  if (loading) return null;
  if (!data?.tambahan) return null; // no Tambahan started for this SO yet

  const { tambahan, items } = data;
  const totalOutstanding = items.reduce((sum, it) => sum + Math.max(0, it.pickedQty - it.shippedQty), 0);
  return (
    <div className="pl-10 mt-3 border-l border-zinc-800">
      <div className="pl-4">
        <span className="text-sm font-medium text-amber-400 underline underline-offset-4">
          {tambahan.tambahanNumber}
        </span>

        {items.length === 0 ? (
          <p className="text-xs text-zinc-600 mt-2">Belum ada barang tambahan yang di-pick.</p>
        ) : (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-zinc-500 text-left">
                <th className="py-1 font-medium">SKU</th>
                <th className="py-1 font-medium">Nama</th>
                <th className="py-1 font-medium text-right">Picked</th>
                <th className="py-1 font-medium text-right">Shipped</th>
                <th className="py-1 font-medium text-right">Outstanding</th>
                <th className="py-1 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <TambahanItemRow
                  key={it.itemId}
                  tambahanNumber={tambahan.tambahanNumber}
                  item={it}
                  onSaved={refresh}
                />
              ))}
            </tbody>
          </table>
        )}
        {totalOutstanding > 0 && (
          <div className="mt-2">
            <button
              onClick={handleConfirmTambahan}
              disabled={confirming}
              className="px-3 py-1.5 rounded-md border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-50 transition-colors"
            >
              {confirming ? "Confirming..." : `Confirm Tambahan (release ${totalOutstanding} leftover)`}
            </button>
          </div>
        )}
        <div className="mt-3">
          {tambahan.status === "CONVERTED" ? (
            <p className="text-xs text-emerald-400">
              Converted to <span className="font-mono text-amber-400">{tambahan.convertedSoNumber}</span> on{" "}
              {tambahan.convertedAt ? new Date(tambahan.convertedAt).toLocaleDateString() : ""}.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Real SO Number</label>
                <input
                  type="text"
                  value={newSoNumber}
                  onChange={(e) => setNewSoNumber(e.target.value)}
                  placeholder="e.g. SO-10234"
                  className="px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1">Order Date</label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                onClick={handleConvert}
                disabled={converting}
                className="px-3 py-1.5 rounded-md bg-amber-500 text-zinc-950 text-xs font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {converting ? "Converting..." : "Confirm & Create SO"}
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function TambahanItemRow({
  tambahanNumber,
  item,
  onSaved,
}: {
  tambahanNumber: string;
  item: TambahanItem;
  onSaved: () => void;
}) {
  const outstanding = item.pickedQty - item.shippedQty;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(outstanding.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both Edit and Delete go through the same correction: the "Marked Qty"
  // for this SKU under this Tambahan is picked-minus-shipped, and this
  // sets that outstanding amount directly — 0 for Delete (nothing left
  // to ship, e.g. the picker over-picked by mistake), or any other value
  // for Edit (e.g. correcting a miscount).
  async function save(newOutstanding: number) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/location-stock/outbound-breakdown/correct-tambahan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemSku: item.itemSku, tambahanNumber, newQuantity: newOutstanding }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <tr className="border-t border-zinc-900">
      <td className="py-1 font-mono">{item.itemSku}</td>
      <td className="py-1 text-zinc-400">{item.itemName}</td>
      <td className="py-1 text-right font-mono">{item.pickedQty}</td>
      <td className="py-1 text-right font-mono">{item.shippedQty}</td>
      <td className="py-1 text-right font-mono">
        {editing ? (
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-16 px-1.5 py-0.5 rounded bg-zinc-900 border border-amber-700 text-right font-mono text-xs"
          />
        ) : (
          outstanding
        )}
      </td>
      <td className="py-1 text-right">
        {editing ? (
          <div className="flex gap-1.5 justify-end items-center">
            <button
              onClick={() => save(Number(value))}
              disabled={saving}
              className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
            >
              {saving ? "..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setValue(outstanding.toString());
                setError(null);
              }}
              className="text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5 justify-end items-center">
            <button onClick={() => setEditing(true)} className="text-amber-500 hover:underline">
              Edit
            </button>
            {outstanding > 0 && (
              <button onClick={() => save(0)} disabled={saving} className="text-red-400 hover:underline disabled:opacity-50">
                Delete
              </button>
            )}
          </div>
        )}
        {error && <div className="text-red-400 mt-0.5 text-[10px]">{error}</div>}
      </td>
    </tr>
  );
}