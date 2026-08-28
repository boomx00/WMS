"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Session = {
  opnameNumber: string;
  notes: string | null;
  createdAt: string | Date;
  totalLines: number;
  countedLines: number;
  discrepancies: number;
  status: string;
  assignedToUsername: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-400",
  IN_PROGRESS: "bg-amber-950 text-amber-300",
  DONE: "bg-emerald-950 text-emerald-300",
};

export default function StockOpnameClient({
  sessions,
  users,
}: {
  sessions: Session[];
  users: { username: string }[];
}) {
  const router = useRouter();
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
          sessions.map((s) => <OpnameSessionRow key={s.opnameNumber} session={s} />)
        )}
      </div>
    </div>
  );
}

type ReportItem = {
  itemSku: string;
  itemName: string;
  systemQty: number;
  countedQty: number;
  difference: number;
  countedAt: string | null;
  countedByUsername: string | null;
};
type ReportLocation = { locationCode: string; counted: boolean; items: ReportItem[] };
type ReportResponse = {
  opnameNumber: string;
  notes: string | null;
  assignedToUsername: string | null;
  totalLocations: number;
  countedLocations: number;
  report: ReportLocation[];
};

function DifferenceBadge({ difference }: { difference: number }) {
  if (difference === 0) {
    return <span className="text-emerald-400 font-mono">Match</span>;
  }
  const sign = difference > 0 ? "+" : "";
  return (
    <span className={`font-mono ${difference > 0 ? "text-amber-400" : "text-red-400"}`}>
      {sign}
      {difference.toLocaleString()}
    </span>
  );
}

function OpnameSessionRow({ session }: { session: Session }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustResult, setAdjustResult] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  async function toggle() {
    if (!open && !report) {
      setLoading(true);
      const res = await fetch(`/api/stock-opname/${session.opnameNumber}/report`);
      if (res.ok) setReport(await res.json());
      setLoading(false);
    }
    setOpen((prev) => !prev);
  }

  async function handleAdjust() {
    setAdjusting(true);
    setAdjustError(null);
    setAdjustResult(null);

    const res = await fetch(`/api/stock-opname/${session.opnameNumber}/adjust`, {
      method: "POST",
    });
    setAdjusting(false);

    if (!res.ok) {
      const data = await res.json();
      setAdjustError(data.error ?? "Failed to adjust inventory");
      return;
    }

    const data = await res.json();
    setAdjustResult(
      `Applied ${data.applied} adjustment(s), ${data.skipped} already matched${
        data.failed > 0 ? `, ${data.failed} failed (see console)` : ""
      }.`
    );
    if (data.failed > 0) {
      console.warn("Stock opname adjust failures:", data.failures);
    }
    router.refresh();
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-900/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-zinc-500 text-xs transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          <span className="font-mono text-amber-500 text-sm">{session.opnameNumber}</span>
          {session.assignedToUsername && (
            <span className="text-xs text-zinc-500">· PIC: {session.assignedToUsername}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500">
            {session.countedLines}/{session.totalLines} counted
          </span>
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLES[session.status]}`}
          >
            {session.status.replace("_", " ")}
          </span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {session.status === "DONE" && (
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={handleAdjust}
                disabled={adjusting}
                className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {adjusting ? "Adjusting..." : "Adjust"}
              </button>
              {adjustResult && <span className="text-xs text-emerald-400">{adjustResult}</span>}
              {adjustError && <span className="text-xs text-red-400">{adjustError}</span>}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-zinc-600">Loading...</p>
          ) : !report ? (
            <p className="text-xs text-red-400">Failed to load report</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-left border-t border-zinc-800 pt-2">
                  <th className="py-2 font-medium">Location</th>
                  <th className="py-2 font-medium">SKU</th>
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium text-right">System Qty</th>
                  <th className="py-2 font-medium text-right">Counted Qty</th>
                  <th className="py-2 font-medium text-right">Difference</th>
                  <th className="py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {report.report.flatMap((loc) =>
                  loc.items.length === 0 ? (
                    <tr key={loc.locationCode} className="border-t border-zinc-800/60">
                      <td className="py-1.5 font-mono text-amber-500">{loc.locationCode}</td>
                      <td colSpan={6} className="py-1.5 text-zinc-700">
                        Not counted yet
                      </td>
                    </tr>
                  ) : (
                    loc.items.map((item, i) => (
                      <tr key={`${loc.locationCode}-${i}`} className="border-t border-zinc-800/60">
                        <td className="py-1.5 font-mono text-amber-500">{loc.locationCode}</td>
                        <td className="py-1.5 font-mono text-zinc-300">{item.itemSku}</td>
                        <td className="py-1.5 text-zinc-500">{item.itemName}</td>
                        <td className="py-1.5 text-right font-mono text-zinc-400">
                          {item.systemQty.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right font-mono">{item.countedQty.toLocaleString()}</td>
                        <td className="py-1.5 text-right">
                          <DifferenceBadge difference={item.difference} />
                        </td>
                        <td className="py-1.5 text-zinc-500">{item.countedByUsername ?? "—"}</td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
