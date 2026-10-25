"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";
import { useCan } from "@/lib/AccessContext";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { LOCATION_STOCK_WAREHOUSE_LABELS } from "@/lib/warehouseLabels";

type Row = {
  id: number;
  locationCode: string;
  locationType: string;
  locationArea: string | null;
  isStaging: boolean;
  warehouseId: number;
  typeName: string;
  typeOrder: number;
  hasPosition: boolean;
  pickable: boolean;
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

// Groups follow the type order from the Locations page. Locations without
// a rack position are grouped by type (Floor, Outbound WH, Destroy, ...);
// those with one are grouped by area (Area A, Area B, ...).
type Group = { key: string; label: string; typeOrder: number; area: string; rows: Row[]; locationCount: number };

function groupKeyFor(row: Row): string {
  return row.hasPosition ? `${row.locationType}:${row.locationArea ?? "?"}` : row.locationType;
}

// Open pick areas (pickable, no rack position — today the FLOOR type).
function isOpenPickArea(row: Row): boolean {
  return row.pickable && !row.hasPosition;
}

export default function LocationStockTable({
  rows,
  warehouses,
}: {
  rows: Row[];
  warehouses: { id: number; name: string; isActive: boolean }[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // null = every warehouse. The filter only shows with more than one.
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
    const labels = usePageLabels("location_stock", LOCATION_STOCK_WAREHOUSE_LABELS);
  const [searchResults, setSearchResults] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  async function runSearch(query: string) {
    setSearching(true);
    const warehousePart = warehouseId ? `&warehouseId=${warehouseId}` : "";
    const res = await fetch(`/api/location-stock/search?q=${encodeURIComponent(query)}${warehousePart}`);
    setSearching(false);
    if (res.ok) {
      setSearchResults(await res.json());
    }
  }

  // Searches the whole location_stock table in the database, not just
  // whatever's already loaded on this page — same debounced pattern used
  // on Work Orders, Sales Orders, and Movement History (v2).
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }

    const handle = setTimeout(() => {
      runSearch(search.trim());
    }, 300);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, warehouseId]);

  // If a search is active, re-run it against the database; otherwise
  // refresh the server-rendered default listing — either way, no full
  // page reload needed.
  function handleRefresh() {
    if (search.trim()) {
      runSearch(search.trim());
    } else {
      router.refresh();
    }
  }

  const isSearching = search.trim().length > 0;
  const baseRows = useMemo(() => {
    const all = searchResults ?? rows;
    return warehouseId === null ? all : all.filter((r) => r.warehouseId === warehouseId);
  }, [searchResults, rows, warehouseId]);

  // Floor + Rack totals — recalculated from whatever's currently showing
  // (search results if a search is active, otherwise the full dataset),
  // so the numbers track the SKU/location filter above the table.
  const stockTotals = useMemo(() => {
    let floor = 0;
    let rack = 0;
    for (const row of baseRows) {
      if (isOpenPickArea(row)) floor += row.quantity;
      else if (row.hasPosition) rack += row.quantity;
    }
    return { floor, rack, total: floor + rack };
  }, [baseRows]);

  const groups = useMemo(() => {
    const byKey = new Map<string, Row[]>();
    for (const row of baseRows) {
      const key = groupKeyFor(row);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(row);
    }

    // With more than one positioned type (e.g. Rack and Cold Room), area
    // groups say which type they belong to.
    const positionedTypes = new Set(baseRows.filter((r) => r.hasPosition).map((r) => r.locationType));

    return Array.from(byKey.entries())
      .map(([key, groupRows]): Group => {
        const first = groupRows[0];
        const area = first.hasPosition ? first.locationArea ?? "?" : "";
        const label = !first.hasPosition
          ? first.typeName
          : positionedTypes.size > 1
            ? `${first.typeName} · Area ${area}`
            : `Area ${area}`;
        return {
          key,
          label,
          typeOrder: first.typeOrder,
          area,
          rows: groupRows,
          locationCount: new Set(groupRows.map((r) => r.locationCode)).size,
        };
      })
      .sort(
        (a, b) =>
          a.typeOrder - b.typeOrder ||
          a.key.split(":")[0].localeCompare(b.key.split(":")[0]) ||
          a.area.localeCompare(b.area)
      );
  }, [baseRows]);

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
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.location_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {labels.header_description}
        </p>
      </header>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">{labels.total_stock_card}</p>
          <p className="text-lg font-semibold">{stockTotals.total.toLocaleString()}</p>
        </div>
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">{labels.total_floor_card}</p>
          <p className="text-lg font-semibold">{stockTotals.floor.toLocaleString()}</p>
        </div>
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">{labels.total_rack}</p>
          <p className="text-lg font-semibold">{stockTotals.rack.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.search_placeholder}
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
        {warehouses.length > 1 && (
          <select
            value={warehouseId ?? ""}
            onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
            aria-label={labels.warehouse_filter}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">{labels.all_warehouses}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.isActive ? w.name : `${w.name} ${labels.warehouse_inactive_suffix}`}
              </option>
            ))}
          </select>
        )}
        <RefreshButton onClick={handleRefresh} loading={searching} />
      </div>

      <p className="text-xs text-zinc-600 mb-3">
        {searching
          ? "Searching..."
          : isSearching
            ? `${baseRows.length.toLocaleString()} result(s) for "${search.trim()}" · matching groups expanded automatically`
            : `${baseRows.length.toLocaleString()} rows`}
      </p>

      {groups.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg px-4 py-8 text-center text-zinc-600 text-sm">
          {isSearching ? "No matching stock." : "No stock recorded yet."}
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
              labels={labels}
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
  labels,
}: {
  group: Group;
  open: boolean;
  onToggle: () => void;
  searchable: boolean;
  labels: Record <string, string>
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
              <th className="px-4 py-2 font-medium">{labels.th_location}</th>
              <th className="px-4 py-2 font-medium">{labels.th_sku}</th>
              <th className="px-4 py-2 font-medium">{labels.th_product}</th>
              <th className="px-4 py-2 font-medium text-right">{labels.th_quantity}</th>
              <th className="px-4 py-2 font-medium text-right">{labels.th_updated}</th>
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
  locationCode: string | null;
  totalInOutboundWh: number;
  unmarked: number;
  markingEnabled?: boolean;
  // pickedFrom: where that order's stock here was picked from
  markedBySo?: { salesOrderId: number; soNumber: string; quantity: number; pickedFrom?: string[] }[];
  markedByTambahan?: { tambahanOrderId: number; tambahanNumber: string; quantity: number; pickedFrom?: string[] }[];
};

function OutboundRow({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Staging locations show what's marked for which order in that location.
  const isOutboundWh = row.isStaging;

  async function toggle() {
    if (!isOutboundWh) return;
    if (!open && !breakdown) {
      setLoading(true);
      const res = await fetch(
        `/api/location-stock/outbound-breakdown?sku=${encodeURIComponent(row.itemSku)}&locationCode=${encodeURIComponent(row.locationCode)}`
      );
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
          {!row.hasPosition && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {row.typeName}
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
    const res = await fetch(
      `/api/location-stock/outbound-breakdown?sku=${encodeURIComponent(breakdown.itemSku)}&locationCode=${encodeURIComponent(breakdown.locationCode ?? "")}`
    );
    if (res.ok) setBreakdown(await res.json());
  }

  const markedBySo = breakdown.markedBySo ?? [];
  const markedByTambahan = breakdown.markedByTambahan ?? [];

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

      {breakdown.markingEnabled === false ? (
        <p className="text-xs text-zinc-600">Order marking is off — this stock is a shared pool any SO can ship from.</p>
      ) : markedBySo.length === 0 && markedByTambahan.length === 0 ? (
        <p className="text-xs text-zinc-600">Nothing marked to any SO yet.</p>
      ) : (
        <>
          {markedBySo.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-left">
                  <th className="py-1 font-medium">SO Number</th>
                  <th className="py-1 font-medium text-right">Marked Qty</th>
                  <th className="py-1 pl-4 font-medium">Picked from</th>
                  <th className="py-1 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {markedBySo.map((m) => (
                  <CorrectableRow
                    key={m.salesOrderId}
                    itemSku={breakdown.itemSku}
                    locationCode={breakdown.locationCode}
                    soNumber={m.soNumber}
                    quantity={m.quantity}
                    pickedFrom={m.pickedFrom ?? []}
                    onSaved={refresh}
                  />
                ))}
              </tbody>
            </table>
          )}

          {markedByTambahan.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-left">
                  <th className="py-1 font-medium">Tambahan</th>
                  <th className="py-1 font-medium text-right">Marked Qty</th>
                  <th className="py-1 pl-4 font-medium">Picked from</th>
                  <th className="py-1 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {markedByTambahan.map((m) => (
                  <CorrectableTambahanRow
                    key={m.tambahanOrderId}
                    itemSku={breakdown.itemSku}
                    locationCode={breakdown.locationCode}
                    tambahanNumber={m.tambahanNumber}
                    quantity={m.quantity}
                    pickedFrom={m.pickedFrom ?? []}
                    onSaved={refresh}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function CorrectableRow({
  itemSku,
  locationCode,
  soNumber,
  quantity,
  pickedFrom,
  onSaved,
}: {
  itemSku: string;
  locationCode: string | null;
  soNumber: string;
  quantity: number;
  pickedFrom: string[];
  onSaved: () => void;
}) {
  const canEdit = useCan()("locationStock.editOutboundWh");
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
      body: JSON.stringify({ itemSku, soNumber, newQuantity: Number(value), locationCode }),
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
      <td className="py-1.5 pl-4 font-mono text-zinc-500">{pickedFrom.length ? pickedFrom.join(", ") : "—"}</td>
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
        ) : canEdit ? (
          <button onClick={() => setEditing(true)} className="text-amber-500 hover:underline">
            Edit
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function CorrectableTambahanRow({
  itemSku,
  locationCode,
  tambahanNumber,
  quantity,
  pickedFrom,
  onSaved,
}: {
  itemSku: string;
  locationCode: string | null;
  tambahanNumber: string;
  quantity: number;
  pickedFrom: string[];
  onSaved: () => void;
}) {
  const canEdit = useCan()("locationStock.editOutboundWh");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(quantity.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/location-stock/outbound-breakdown/correct-tambahan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemSku, tambahanNumber, newQuantity: Number(value), locationCode }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <tr className="border-t border-zinc-900">
      <td className="py-1 font-mono text-amber-400">{tambahanNumber}</td>
      <td className="py-1 text-right font-mono">
        {editing ? (
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-right font-mono text-xs"
          />
        ) : (
          quantity
        )}
      </td>
      <td className="py-1 pl-4 font-mono text-zinc-500">{pickedFrom.length ? pickedFrom.join(", ") : "—"}</td>
      <td className="py-1 text-right">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
            >
              {saving ? "..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setValue(quantity.toString());
                setError(null);
              }}
              className="text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : canEdit ? (
          <button onClick={() => setEditing(true)} className="text-zinc-500 hover:text-zinc-300">
            Edit
          </button>
        ) : null}
        {error && <div className="text-red-400 mt-0.5">{error}</div>}
      </td>
    </tr>
  );
}