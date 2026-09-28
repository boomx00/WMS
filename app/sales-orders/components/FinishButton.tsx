"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Order } from "./types";

export default function FinishButton({ order, isAdmin }: { order: Order; isAdmin: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales-orders/${order.soNumber}/finish`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to finish");
      return;
    }
    router.refresh();
  }

  async function handleUnfinish() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales-orders/${order.soNumber}/unfinish`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to undo");
      return;
    }
    router.refresh();
  }

  if (order.finishedAt) {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300">
          Finished
        </span>
        {isAdmin && (
          <button
            onClick={handleUnfinish}
            disabled={loading}
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            {loading ? "..." : "Undo"}
          </button>
        )}
        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={handleFinish}
        disabled={loading}
        className="text-xs text-amber-500 hover:underline disabled:opacity-50"
      >
        {loading ? "..." : "Confirm Finish"}
      </button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
    </div>
  );
}