"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderLine } from "./types";

export default function ShippedCell({
  order,
  line,
  isAdmin,
}: {
  order: Order;
  line: OrderLine;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(line.shipped));
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const correctedQuantity = Number(value);
    if (!Number.isFinite(correctedQuantity) || correctedQuantity < 0) {
      setError("Enter a valid quantity");
      return;
    }
    if (correctedQuantity >= line.shipped) {
      setError(`Must be less than current shipped (${line.shipped})`);
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales-orders/${order.soNumber}/correct-shipment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: line.itemSku, correctedQuantity, reason: reason.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to correct shipment");
      return;
    }
    setEditing(false);
    setReason("");
    router.refresh();
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {line.shipped.toLocaleString()}
        {isAdmin && (
          <button
            onClick={() => {
              setValue(String(line.shipped));
              setEditing(true);
            }}
            className="text-amber-500 hover:text-amber-400 text-[10px]"
            title="Correct shipped quantity"
          >
            ✎
          </button>
        )}
      </span>
    );
  }

  return (
    <div
      className="flex flex-col items-end gap-1 bg-zinc-900 border border-zinc-700 rounded p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        min={0}
        max={line.shipped - 1}
        className="w-20 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-right font-mono text-xs"
      />
      {Number.isFinite(Number(value)) && Number(value) < line.shipped && (
        <span className="text-[10px] text-zinc-500">
          +{(line.shipped - Number(value)).toLocaleString()} to ecer
        </span>
      )}
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-40 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={loading}
          className="text-xs text-amber-500 hover:underline disabled:opacity-50"
        >
          {loading ? "..." : "Save"}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="text-xs text-zinc-500 hover:underline"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}