"use client";

import { useEffect, useState } from "react";

type Tab = "INBOUND" | "OUTBOUND";

type TransactionRow = {
  id: number;
  transactionCode: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
  itemSku: string;
  itemName: string;
  locationCode: string;
  username: string;
};

export default function OtherTransactionsClient() {
  const [tab, setTab] = useState<Tab>("INBOUND");
  const [locationCode, setLocationCode] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);

  async function refresh(t: Tab) {
    setLoadingRows(true);
    const res = await fetch(`/api/other-transactions?type=${t}`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.transactions ?? []);
    }
    setLoadingRows(false);
  }

  useEffect(() => {
    refresh(tab);
    setError(null);
    setSuccess(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!locationCode || !itemSku || !quantity) {
      setError("Location, SKU, and quantity are required");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/other-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: tab,
        locationCode,
        itemSku,
        quantity: Number(quantity),
        notes: notes || undefined,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to record transaction");
      return;
    }

    const data = await res.json();
    setSuccess(`Recorded as ${data.transactionCode}`);
    setLocationCode("");
    setItemSku("");
    setQuantity("");
    setNotes("");
    refresh(tab);
  }

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-zinc-800">
        {(["INBOUND", "OUTBOUND"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "INBOUND" ? "Other Inbound" : "Other Outbound"}
          </button>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4 mb-8"
      >
        <p className="text-xs text-zinc-500">
          {tab === "INBOUND"
            ? "Adds stock to the entered location."
            : "Removes stock from the entered location."}
        </p>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">Location Code</label>
            <input
              type="text"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              placeholder="e.g. A1.1"
              required
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-zinc-500 mb-1">SKU</label>
            <input
              type="text"
              value={itemSku}
              onChange={(e) => setItemSku(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              required
            />
          </div>
          <div className="w-28">
            <label className="block text-xs text-zinc-500 mb-1">Qty</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            placeholder="Reason for this correction..."
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Recording..." : tab === "INBOUND" ? "Record Other Inbound" : "Record Other Outbound"}
        </button>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">{success}</p>}
      </form>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {loadingRows ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-mono text-amber-400">{r.transactionCode}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono">{r.itemSku}</div>
                    <div className="text-xs text-zinc-500">{r.itemName}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">{r.locationCode}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.quantity}</td>
                  <td className="px-4 py-3 text-zinc-400">{r.username}</td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-zinc-500">{r.notes ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}