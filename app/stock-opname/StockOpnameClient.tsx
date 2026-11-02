"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VerifyStockIntegrityPanel from "./VerifyStockIntegrityPanel";
import StockOpnameSummaryPanel from "./StockOpnameSummaryPanel";
import { STOCK_OPNAME_SUMMARY_LABELS } from "@/lib/stockOpnameSummaryLabels";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import type { Session } from "./_sessions/types";
import { TabButton } from "./_sessions/badges";
import { OpnameSessionRow } from "./_sessions/OpnameSessionRow";

export default function StockOpnameClient({
  sessions,
  users,
}: {
  sessions: Session[];
  users: { username: string }[];
}) {
  const [activeTab, setActiveTab] = useState<"opname" | "verify" | "summary">("opname");
  const router = useRouter();
  const labels = usePageLabels("stock_opname", STOCK_OPNAME_SUMMARY_LABELS);
  const [opnameNumber, setOpnameNumber] = useState("");
  const [locationCodes, setLocationCodes] = useState("");
  const [assignedToUsername, setAssignedToUsername] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const codes = locationCodes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const res = await fetch("/api/stock-opname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opnameNumber: opnameNumber.trim(),
        notes: notes.trim(),
        locationCodes: codes,
        assignedToUsername: assignedToUsername || undefined,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create opname session");
      return;
    }

    const data = await res.json();
    setSuccess(`Created ${opnameNumber.trim()} with ${data.locationCount} location(s) to count.`);
    setOpnameNumber("");
    setLocationCodes("");
    setAssignedToUsername("");
    setNotes("");
    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        <TabButton label={labels.tab_opname} active={activeTab === "opname"} onClick={() => setActiveTab("opname")} />
        <TabButton
          label={labels.tab_verify}
          active={activeTab === "verify"}
          onClick={() => setActiveTab("verify")}
        />
        <TabButton
          label={labels.tab_summary}
          active={activeTab === "summary"}
          onClick={() => setActiveTab("summary")}
        />
      </div>

      {activeTab === "verify" ? (
        <VerifyStockIntegrityPanel />
      ) : activeTab === "summary" ? (
        <StockOpnameSummaryPanel />
      ) : (
        <div>
          <form onSubmit={handleCreate} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4 mb-8">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Opname Number</label>
          <input
            type="text"
            value={opnameNumber}
            onChange={(e) => setOpnameNumber(e.target.value)}
            placeholder="OPNAME-202608-01"
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Locations (comma-separated: exact codes, or "Rack A" / "Rack B" for a whole area — leave blank for
            everywhere)
          </label>
          <input
            type="text"
            value={locationCodes}
            onChange={(e) => setLocationCodes(e.target.value)}
            placeholder="Rack A, Rack B, FLOOR"
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Assign to (PIC)</label>
          <select
            value={assignedToUsername}
            onChange={(e) => setAssignedToUsername(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.username} value={u.username}>
                {u.username}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !opnameNumber}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Create Opname Session"}
        </button>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">{success}</p>}
      </form>

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-12 text-center text-zinc-600 text-sm">
            No opname sessions yet.
          </div>
        ) : (
          sessions.map((s) => <OpnameSessionRow key={s.opnameNumber} session={s} labels={labels} />)
        )}
      </div>
        </div>
      )}
    </div>
  );
}
