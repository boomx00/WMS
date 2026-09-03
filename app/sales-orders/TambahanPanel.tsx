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
    convertedSalesOrderId: number | null;
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

  if (loading) return null;
  if (!data?.tambahan) return null; // no Tambahan started for this SO yet

  const { tambahan, items } = data;

  return (
    // pl-10 ≈ one Word tab-stop of indent, so it visually nests under the
    // original product list above it.
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
                <th className="py-1 font-medium text-right">Shipped/Picked</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.itemId} className="border-t border-zinc-900">
                  <td className="py-1 font-mono">{it.itemSku}</td>
                  <td className="py-1 text-zinc-400">{it.itemName}</td>
                  <td className="py-1 text-right font-mono">
                    {it.shippedQty}/{it.pickedQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-3">
          {tambahan.status === "CONVERTED" ? (
            <p className="text-xs text-emerald-400">
              Converted to a new SO on{" "}
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