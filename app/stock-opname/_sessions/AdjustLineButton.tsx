"use client";

import { useState } from "react";

export function AdjustLineButton({
  opnameNumber,
  locationCode,
  itemId,
  countedQty,
  difference,
  onAdjusted,
}: {
  opnameNumber: string;
  locationCode: string;
  itemId: number;
  countedQty: number;
  difference: number;
  onAdjusted: () => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (difference === 0) {
    return <span className="text-[10px] text-zinc-700">Matched</span>;
  }

  async function handleClick() {
    if (
      !window.confirm(
        `Set system quantity for this SKU at ${locationCode} to the counted amount (${countedQty.toLocaleString()})?`
      )
    ) {
      return;
    }

    setAdjusting(true);
    setError(null);

    const res = await fetch(`/api/stock-opname/${opnameNumber}/adjust-line`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationCode, itemId, countedQty }),
    });
    setAdjusting(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to adjust");
      return;
    }

    onAdjusted();
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleClick}
        disabled={adjusting}
        className="text-[10px] text-amber-500 hover:text-amber-400 disabled:opacity-50"
      >
        {adjusting ? "Adjusting..." : "Adjust"}
      </button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}
