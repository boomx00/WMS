"use client";

import { useMemo, useState } from "react";

type Row = {
  id: number;
  locationCode: string;
  locationType: string;
  locationArea: string | null;
  itemSku: string;
  itemName: string;
  quantity: number;
  palletQuantity: number;
  updatedAt: string | Date;
};

const formatPallet = (value: number | string) => {
  const num = Number(value);
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, "");
};

// Rack areas A-H first, then the special non-rack location types, in this
// order. Anything unexpected falls after these, alphabetically.
const GROUP_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "FLOOR", "DESTROY", "LEFTOVER", "OUTBOUND_WH"];

const GROUP_LABELS: Record<string, string> = {
  FLOOR: "Floor",
  DESTROY: "Destroy",
  LEFTOVER: "Leftover",
  OUTBOUND_WH: "Outbound WH",
};

function groupKeyFor(row: Row): string {
  return row.locationType === "RACK" ? row.locationArea ?? "?" : row.locationType;
}

function labelForGroup(key: string): string {
  if (GROUP_LABELS[key]) return GROUP_LABELS[key];
  if (key.length === 1) return `Area ${key}`;
  return key;
}

export default function LocationStockTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.locationCode.toLowerCase().includes(q) ||
        r.itemSku.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const isSearching = search.trim().length > 0;

  const groups = useMemo(() => {
    const byKey = new Map<string, Row[]>();
    for (const row of filtered) {
      const key = groupKeyFor(row);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(row);
    }

    return Array.from(byKey.entries())
      .map(([key, groupRows]) => ({
        key,
        label: labelForGroup(key),
        rows: groupRows,
        locationCount: new Set(groupRows.map((r) => r.locationCode)).size,
      }))
      .sort((a, b) => {
        const ai = GROUP_ORDER.indexOf(a.key);
        const bi = GROUP_ORDER.indexOf(b.key);
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        }
        return a.key.localeCompare(b.key);
      });
  }, [filtered]);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by location or SKU..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm mb-4 focus:outline-none focus:border-amber-500"
      />

      <p className="text-xs text-zinc-600 mb-3">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} rows
        {isSearching && " · matching groups expanded automatically"}
      </p>

      {groups.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg px-4 py-8 text-center text-zinc-600 text-sm">
          No stock recorded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              open={isSearching || expandedGroups.has(group.key)}
              onToggle={() => toggleGroup(group.key)}
              searchable={isSearching}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupSection({
  group,
  open,
  onToggle,
  searchable,
}: {
  group: { key: string; label: string; rows: Row[]; locationCount: number };
  open: boolean;
  onToggle: () => void;
  searchable: boolean;
}) {
  const totalQuantity = group.rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        disabled={searchable}
        className={`w-full flex items-center justify-between px-4 py-3 text-left bg-zinc-900 ${
          searchable ? "cursor-default" : "hover:bg-zinc-900/70 transition-colors"
        }`}
      >
        <div className="flex items-center gap-2">
          {!searchable && (
            <span className={`text-zinc-500 text-xs inline-block transition-transform ${open ? "rotate-90" : ""}`}>
              ▶
            </span>
          )}
          <span className="text-sm font-medium text-zinc-200">{group.label}</span>
          <span className="text-xs text-zinc-600">
            {group.locationCount.toLocaleString()} location(s) · {group.rows.length.toLocaleString()} SKU record(s)
          </span>
        </div>
        <span className="text-xs font-mono text-zinc-500">{totalQuantity.toLocaleString()} carton</span>
      </button>

      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-950/40 text-zinc-500 text-left">
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">Product</th>
              <th className="px-4 py-2 font-medium text-right">Quantity</th>
              <th className="px-4 py-2 font-medium text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <OutboundRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type BreakdownResponse = {
  itemSku: string;
  itemName: string;
  totalInOutboundWh: number;
  unmarked: number;
  markedBySo: { salesOrderId: number; soNumber: string; quantity: number }[];
};

function OutboundRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const isOutboundWh = row.locationType === "OUTBOUND_WH";

  async function toggle() {
    if (!isOutboundWh) return;
    if (!open && !breakdown) {
      setLoading(true);
      const res = await fetch(`/api/location-stock/outbound-breakdown?sku=${encodeURIComponent(row.itemSku)}`);
      if (res.ok) setBreakdown(await res.json());
      setLoading(false);
    }
    setOpen((prev) => !prev);
  }

  return (
    <>
      <tr
        className={`border-t border-zinc-800 hover:bg-zinc-900/50 ${isOutboundWh ? "cursor-pointer" : ""}`}
        onClick={toggle}
      >
        <td className="px-4 py-3">
          {isOutboundWh && (
            <span className={`text-zinc-500 text-xs mr-1 inline-block transition-transform ${open ? "rotate-90" : ""}`}>
              ▶
            </span>
          )}
          <span className="font-mono text-amber-500">{row.locationCode}</span>
          {row.locationType !== "RACK" && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {row.locationType}
            </span>
          )}
        </td>
        <td className="px-4 py-3 font-mono text-zinc-300">{row.itemSku}</td>
        <td className="px-4 py-3 text-zinc-500">{row.itemName}</td>
        <td className="px-4 py-3 text-right font-mono">{row.quantity.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-zinc-500 text-xs">
          {new Date(row.updatedAt).toLocaleString()}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-zinc-800/60 bg-zinc-950/40">
          <td colSpan={5} className="px-4 py-4">
            {loading ? (
              <p className="text-xs text-zinc-600">Loading...</p>
            ) : !breakdown ? (
              <p className="text-xs text-red-400">Failed to load breakdown</p>
            ) : (
              <BreakdownDetail breakdown={breakdown} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function BreakdownDetail({ breakdown: initial }: { breakdown: BreakdownResponse }) {
  const [breakdown, setBreakdown] = useState(initial);

  async function refresh() {
    const res = await fetch(`/api/location-stock/outbound-breakdown?sku=${encodeURIComponent(breakdown.itemSku)}`);
    if (res.ok) setBreakdown(await res.json());
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-6 text-xs">
        <span className="text-zinc-500">
          Total: <span className="text-zinc-200 font-mono">{breakdown.totalInOutboundWh}</span>
        </span>
        <span className="text-zinc-500">
          Unmarked (ecer): <span className="text-amber-400 font-mono">{breakdown.unmarked}</span>
        </span>
      </div>

      {breakdown.markedBySo.length === 0 ? (
        <p className="text-xs text-zinc-600">Nothing marked to any SO yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left">
              <th className="py-1 font-medium">SO Number</th>
              <th className="py-1 font-medium text-right">Marked Qty</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {breakdown.markedBySo.map((m) => (
              <CorrectableRow
                key={m.salesOrderId}
                itemSku={breakdown.itemSku}
                soNumber={m.soNumber}
                quantity={m.quantity}
                onSaved={refresh}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CorrectableRow({
  itemSku,
  soNumber,
  quantity,
  onSaved,
}: {
  itemSku: string;
  soNumber: string;
  quantity: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(quantity.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/location-stock/outbound-breakdown/correct", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemSku, soNumber, newQuantity: Number(value) }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to correct");
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <tr className="border-t border-zinc-800/60">
      <td className="py-1.5 font-mono text-amber-500">{soNumber}</td>
      <td className="py-1.5 text-right font-mono">
        {editing ? (
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-xs font-mono text-right focus:outline-none"
          />
        ) : (
          quantity
        )}
      </td>
      <td className="py-1.5 text-right">
        {editing ? (
          <div className="flex gap-2 justify-end items-center">
            {error && <span className="text-red-400">{error}</span>}
            <button onClick={save} disabled={saving} className="text-amber-500 hover:underline">
              {saving ? "..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="text-zinc-500 hover:underline">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-amber-500 hover:underline">
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
