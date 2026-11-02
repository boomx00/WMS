"use client";

import { useState } from "react";

export function ConfirmPanel({
  opnameNumber,
  alreadyFinished,
  onConfirmed,
}: {
  opnameNumber: string;
  alreadyFinished: boolean;
  onConfirmed: () => void;
}) {
  const [description, setDescription] = useState("");
  const [attachBulkAdjustment, setAttachBulkAdjustment] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleConfirm() {
    if (!window.confirm("Confirm this stock opname session? This cannot be undone.")) return;

    setConfirming(true);
    setError(null);
    setResult(null);

    const res = await fetch(`/api/stock-opname/${opnameNumber}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description.trim(), attachBulkAdjustment }),
    });
    setConfirming(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to confirm");
      return;
    }

    const data = await res.json();
    setResult(
      data.bulkAdjustment
        ? `Confirmed — adjustment ${data.bulkAdjustment.adjustmentCode} applied (${data.bulkAdjustment.applied} line(s)).`
        : "Confirmed."
    );
    onConfirmed();
  }

  return (
    <div className="mb-4 border border-zinc-800 rounded-lg p-4 bg-zinc-900/50 space-y-3">
      {!alreadyFinished && (
        <p className="text-xs text-amber-400">
          This session hasn&apos;t been marked Finished on the PDA yet — confirming here will finish and confirm it in one step.
        </p>
      )}
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Confirmation description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={attachBulkAdjustment}
          onChange={(e) => setAttachBulkAdjustment(e.target.checked)}
        />
        Attach bulk adjustment (apply every counted discrepancy to system stock, tracked under one Adjustment ID)
      </label>

      <button
        onClick={handleConfirm}
        disabled={confirming}
        className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {confirming ? "Confirming..." : "Confirm Opname"}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && <p className="text-xs text-emerald-400">{result}</p>}
    </div>
  );
}
