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

type FormRow = { locationCode: string; itemSku: string; quantity: string };

const EMPTY_ROW: FormRow = { locationCode: "", itemSku: "", quantity: "" };

export default function OtherTransactionsClient() {
  const [tab, setTab] = useState<Tab>("INBOUND");
  const [formRows, setFormRows] = useState<FormRow[]>([{ ...EMPTY_ROW }]);
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

  function updateRow(index: number, field: keyof FormRow, value: string) {
    setFormRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setFormRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function removeRow(index: number) {
    setFormRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Fully blank rows are ignored; partially filled ones are flagged below.
    const filled = formRows
      .map((r) => ({
        locationCode: r.locationCode.trim(),
        itemSku: r.itemSku.trim(),
        quantity: r.quantity.trim(),
      }))
      .filter((r) => r.locationCode || r.itemSku || r.quantity);

    if (filled.length === 0) {
      setError("Add at least one row");
      return;
    }

    for (let i = 0; i < filled.length; i++) {
      const r = filled[i];
      if (!r.locationCode || !r.itemSku || !r.quantity) {
        setError(`Row ${i + 1}: location, SKU, and quantity are required`);
        return;
      }
    }

    const lines = filled.map((r) => ({
      locationCode: r.locationCode,
      itemSku: r.itemSku,
      quantity: Number(r.quantity),
    }));

    setSubmitting(true);
    const res = await fetch("/api/other-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: tab,
        lines,
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
    const codes: string[] = data.transactionCodes ?? [data.transactionCode];
    setSuccess(
      codes.length === 1
        ? `Recorded as ${codes[0]}`
        : codes.length <= 6
          ? `Recorded ${codes.length} lines: ${codes.join(", ")}`
          : `Recorded ${codes.length} lines: ${codes[0]} … ${codes[codes.length - 1]}`
    );
    setFormRows([{ ...EMPTY_ROW }]);
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
            ? "Adds stock to each entered location. Add as many rows as you need — the whole batch is recorded together, or not at all."
            : "Removes stock from each entered location. Add as many rows as you need — the whole batch is recorded together, or not at all."}
        </p>

        <div className="space-y-2">
          <div className="flex gap-2 items-center text-xs text-zinc-500">
            <div className="flex-1">Location Code</div>
            <div className="flex-1">SKU</div>
            <div className="w-28">Qty</div>
            <div className="w-8" />
          </div>

          {formRows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={row.locationCode}
                onChange={(e) => updateRow(i, "locationCode", e.target.value)}
                placeholder="e.g. A1.1"
                className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                value={row.itemSku}
                onChange={(e) => updateRow(i, "itemSku", e.target.value)}
                placeholder="SKU"
                className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                min={1}
                value={row.quantity}
                onChange={(e) => updateRow(i, "quantity", e.target.value)}
                placeholder="Qty"
                className="w-28 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={formRows.length === 1}
                className="w-8 text-zinc-600 hover:text-red-400 disabled:opacity-30 text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="text-xs text-amber-500 hover:text-amber-400">
          + Add row
        </button>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Notes (optional, applies to every row)</label>
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