"use client";

import { useEffect, useState } from "react";
import CombineCsoPanel from "./CombineCsoPanel";
import type { CsoSummary } from "./_combine/types";
import { fmtQty } from "./_summary/format";

// Verify Stock Integrity → CSO Summary.
//
// Type the stock opname activity's name and Create: that locks the whole
// system stock (every location and its quantity per SKU) into a new card.
// Open a card to pick which CSO sessions to combine; the report compares
// them against the stock locked on that card, not live stock.
export default function CsoSummaryPanel() {
  const [summaries, setSummaries] = useState<CsoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/stock-opname/cso-summaries");
    if (res.ok) {
      const data = await res.json();
      setSummaries(data.summaries);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      !window.confirm(
        `Create "${trimmed}"?\n\nThis locks the current system stock of every location. CSO sessions combined in this summary are compared against that locked stock.`
      )
    )
      return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/stock-opname/cso-summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create summary");
      return;
    }
    setName("");
    await refresh();
  }

  async function handleDelete(summary: CsoSummary) {
    if (
      !window.confirm(
        `Delete "${summary.name}" and its locked stock?\n\nThe CSO sessions and their counts are not deleted.`
      )
    )
      return;
    setError(null);
    const res = await fetch(`/api/stock-opname/cso-summaries/${summary.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to delete summary");
      return;
    }
    await refresh();
  }

  const open = openId !== null ? summaries.find((s) => s.id === openId) ?? null : null;
  if (open) {
    return (
      <CombineCsoPanel
        key={open.id}
        summary={open}
        onBack={() => {
          setOpenId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-4">
        Start each stock opname activity here. Creating it locks the system stock of every location at that moment.
        Open its card to choose the CSO sessions (e.g. <span className="font-mono">CSO-Budi-01</span>,{" "}
        <span className="font-mono">CSO-Siti-02</span>) to combine. They are compared against the locked stock, so
        stock moving while people count doesn&apos;t change the result. Stock is never changed here.
      </p>

      <form
        onSubmit={handleCreate}
        className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 mb-5 flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-64">
          <label className="block text-xs text-zinc-500 mb-1">Stock Opname Activity Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Opname Akhir Bulan November 2026"
            maxLength={200}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {creating ? "Locking stock..." : "Create & Lock Stock"}
        </button>
      </form>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {loading ? (
        <div className="py-6 text-center text-zinc-600 text-sm">Loading...</div>
      ) : summaries.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg py-8 text-center text-zinc-600 text-sm">
          No CSO Summary yet. Type an activity name above and create one.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summaries.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenId(s.id);
                }
              }}
              className="group border border-zinc-800 rounded-lg p-4 bg-zinc-900/30 hover:border-amber-500/60 hover:bg-zinc-900/60 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-zinc-100 break-words">{s.name}</div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(s);
                  }}
                  title="Delete this summary"
                  className="text-xs text-zinc-600 hover:text-red-400 shrink-0"
                >
                  Delete
                </button>
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Stock locked {s.createdAt}
                {s.createdBy ? ` · ${s.createdBy}` : ""}
              </div>
              <div className="text-xs text-zinc-400 mt-3 font-mono">
                {s.skus.toLocaleString()} SKUs · {s.locations.toLocaleString()} locations · {fmtQty(s.quantity)} ctn
                {s.loosePacks > 0 ? ` + ${s.loosePacks.toLocaleString()} pk` : ""}
              </div>
              <div className="text-xs mt-2">
                {s.opnameNumbers.length > 0 ? (
                  <span className="text-zinc-500">
                    Combined: <span className="font-mono text-amber-500">{s.opnameNumbers.join(", ")}</span>
                  </span>
                ) : (
                  <span className="text-zinc-600 italic">No CSO combined yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
