"use client";

import { useState, useEffect } from "react";

export function ConfirmModal({
  opnameNumber,
  onClose,
  onConfirmed,
}: {
  opnameNumber: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [adjustments, setAdjustments] = useState<{ id: number; adjustmentCode: string; description: string | null }[]>([]);
  const [bulkAdjustmentCode, setBulkAdjustmentCode] = useState("");
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bulk-adjustments")
      .then((res) => (res.ok ? res.json() : []))
      .then(setAdjustments)
      .catch(() => setAdjustments([]));
  }, []);

  async function handleConfirm() {
    setConfirming(true);
    setError(null);

    const res = await fetch(`/api/stock-opname/${opnameNumber}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description.trim(), bulkAdjustmentCode: bulkAdjustmentCode.trim() }),
    });
    setConfirming(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to confirm");
      return;
    }

    onConfirmed();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-md space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200">Confirm Stock Opname</h3>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Bulk Adjustment ID (optional)</label>
          <select
            value={bulkAdjustmentCode}
            onChange={(e) => setBulkAdjustmentCode(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          >
            <option value="">None</option>
            {adjustments.map((a) => (
              <option key={a.id} value={a.adjustmentCode}>
                {a.adjustmentCode}
                {a.description ? ` — ${a.description}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={confirming}
            className="px-4 py-2 rounded-md border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {confirming ? "Confirming..." : "Finalize Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
