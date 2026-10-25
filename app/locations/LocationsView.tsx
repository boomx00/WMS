"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { LOCATIONS_WAREHOUSE_LABELS } from "@/lib/warehouseLabels";
import { useCan } from "@/lib/AccessContext";
import LocationTypeModal from "./LocationTypeModal";
import LocationModal from "./LocationModal";
import WarehouseModal from "./WarehouseModal";
import {
  Badge,
  IconButton,
  PencilIcon,
  columnLabel,
  purposeLabels,
  type Labels,
  type LocationRowData,
  type StockColumnOption,
  type TypeRow,
  type WarehouseRow,
  readError,
} from "./locationUi";

type Tab = "types" | "locations" | "warehouses";

export default function LocationsView({
  types,
  locations,
  columns,
  warehouses,
}: {
  types: TypeRow[];
  locations: LocationRowData[];
  columns: StockColumnOption[]; // Total Stock columns (every warehouse's), in display order
  warehouses: WarehouseRow[]; // in display order; the first is the default
}) {
  const labels = usePageLabels("locations_master", LOCATIONS_WAREHOUSE_LABELS);
  const can = useCan();
  const canEdit = can("locations.edit");
  const [tab, setTab] = useState<Tab>("types");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "types", label: labels.tab_types, count: types.length },
    { key: "locations", label: labels.tab_locations, count: locations.length },
    { key: "warehouses", label: labels.tab_warehouses, count: warehouses.length },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.page_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {canEdit ? labels.header_description : labels.read_only}
        </p>
      </header>

      <div className="flex gap-1 mb-6 border border-zinc-800 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {t.label} <span className={tab === t.key ? "text-zinc-800" : "text-zinc-600"}>({t.count})</span>
          </button>
        ))}
      </div>

      {tab === "types" ? (
        <TypesTab types={types} locations={locations} canEdit={canEdit} labels={labels} />
      ) : tab === "locations" ? (
        <LocationsTab
          types={types}
          locations={locations}
          columns={columns}
          warehouses={warehouses}
          canEdit={canEdit}
          labels={labels}
        />
      ) : (
        <WarehousesTab warehouses={warehouses} locations={locations} canEdit={canEdit} labels={labels} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Shared bits
// ------------------------------------------------------------

function Toolbar({
  search,
  onSearch,
  placeholder,
  buttonLabel,
  onAdd,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  buttonLabel: string;
  onAdd: (() => void) | null; // null = no permission, no button
}) {
  return (
    <div className="flex gap-3 mb-4">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
      />
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 transition-colors whitespace-nowrap"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-600">
        {text}
      </td>
    </tr>
  );
}

const th = "px-4 py-3 font-medium";
const td = "px-4 py-3";
const dash = <span className="text-zinc-600">—</span>;

// ------------------------------------------------------------
// Types tab
// ------------------------------------------------------------

function TypesTab({
  types,
  locations,
  canEdit,
  labels,
}: {
  types: TypeRow[];
  locations: LocationRowData[];
  canEdit: boolean;
  labels: Labels;
}) {
  const [search, setSearch] = useState("");
  // undefined = closed, null = adding a new type
  const [open, setOpen] = useState<TypeRow | null | undefined>(undefined);

  const q = search.trim().toLowerCase();
  const shown = q
    ? types.filter((t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
    : types;

  return (
    <>
      <Toolbar
        search={search}
        onSearch={setSearch}
        placeholder={labels.search_types_placeholder}
        buttonLabel={labels.btn_add_type}
        onAdd={canEdit ? () => setOpen(null) : null}
      />

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className={th}>{labels.th_name}</th>
              <th className={th}>{labels.th_sku_rule}</th>
              <th className={th}>{labels.th_position}</th>
              <th className={th}>{labels.th_pickable}</th>
              <th className={`${th} text-right`}>{labels.th_max_pallets}</th>
              <th className={`${th} text-right`}>{labels.th_locations}</th>
              <th className={`${th} w-14`} />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <EmptyRow colSpan={7} text={q ? labels.no_results : labels.empty} />
            ) : (
              shown.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setOpen(t)}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                >
                  <td className={td}>
                    <div className="text-zinc-200">{t.name}</div>
                    <div className="font-mono text-xs text-zinc-600">{t.code}</div>
                  </td>
                  <td className={td}>
                    {t.allowsMultipleSku ? (
                      <span className="text-zinc-400">{labels.sku_multiple}</span>
                    ) : (
                      <Badge>{labels.sku_single}</Badge>
                    )}
                  </td>
                  <td className={`${td} text-zinc-400`}>{t.hasPosition ? labels.yes : dash}</td>
                  <td className={`${td} text-zinc-400`}>{t.pickable ? labels.yes : dash}</td>
                  <td className={`${td} text-right font-mono text-zinc-400`}>{t.maxPallets ?? dash}</td>
                  <td className={`${td} text-right font-mono text-zinc-400`}>{t.locationCount.toLocaleString()}</td>
                  <td className={td}>
                    <div className="flex justify-end">
                      <IconButton title={labels.btn_edit} onClick={() => setOpen(t)}>
                        <PencilIcon />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open !== undefined && (
        <LocationTypeModal
          // Remount per type so the form starts from that type's values.
          key={open?.id ?? "new"}
          type={open}
          positionMissing={open ? locations.filter((l) => l.type === open.code && l.area == null).length : 0}
          crowded={open ? locations.filter((l) => l.type === open.code && l.skuCount > 1).length : 0}
          readOnly={!canEdit}
          labels={labels}
          onClose={() => setOpen(undefined)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------
// Locations tab
// ------------------------------------------------------------

function LocationsTab({
  types,
  locations,
  columns,
  warehouses,
  canEdit,
  labels,
}: {
  types: TypeRow[];
  locations: LocationRowData[];
  columns: StockColumnOption[];
  warehouses: WarehouseRow[];
  canEdit: boolean;
  labels: Labels;
}) {
  const [search, setSearch] = useState("");
  // null = all warehouses. Only offered when there's more than one.
  const [warehouseFilter, setWarehouseFilter] = useState<number | null>(null);
  const multiWarehouse = warehouses.length > 1;
  const warehouseName = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  // undefined = closed, null = adding a new location
  const [open, setOpen] = useState<LocationRowData | null | undefined>(undefined);

  const typeByCode = useMemo(() => new Map(types.map((t) => [t.code, t])), [types]);

  // The Total Stock column most counted locations of each type show under,
  // per warehouse ("warehouseId:TYPE") — what a new location of that type
  // starts with (racks → Good Stock).
  const columnForType = useMemo(() => {
    const tally = new Map<string, Map<number | null, number>>();
    for (const l of locations) {
      if (!l.countsInTotalStock) continue;
      const key = `${l.warehouseId}:${l.type}`;
      const counts = tally.get(key) ?? new Map<number | null, number>();
      counts.set(l.stockColumnId, (counts.get(l.stockColumnId) ?? 0) + 1);
      tally.set(key, counts);
    }
    const result: Record<string, number | null> = {};
    for (const [type, counts] of tally) {
      result[type] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    return result;
  }, [locations]);

  const q = search.trim().toLowerCase();
  const inWarehouse = warehouseFilter === null ? locations : locations.filter((l) => l.warehouseId === warehouseFilter);
  const shown = q
    ? inWarehouse.filter((l) => {
        const typeName = typeByCode.get(l.type)?.name ?? "";
        return (
          l.code.toLowerCase().includes(q) ||
          l.type.toLowerCase().includes(q) ||
          typeName.toLowerCase().includes(q) ||
          (l.area ?? "").toLowerCase() === q
        );
      })
    : inWarehouse;
  const colCount = multiWarehouse ? 8 : 7;

  return (
    <>
      <Toolbar
        search={search}
        onSearch={setSearch}
        placeholder={labels.search_locations_placeholder}
        buttonLabel={labels.btn_add_location}
        onAdd={canEdit ? () => setOpen(null) : null}
      />

      {multiWarehouse && (
        <div className="flex items-center gap-2 mb-4">
          <label htmlFor="locations-warehouse-filter" className="text-xs text-zinc-500">
            {labels.th_warehouse}
          </label>
          <select
            id="locations-warehouse-filter"
            value={warehouseFilter ?? ""}
            onChange={(e) => setWarehouseFilter(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">{labels.filter_all_warehouses}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.isActive ? w.name : `${w.name} ${labels.warehouse_inactive_suffix}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className={th}>{labels.th_code}</th>
              {multiWarehouse && <th className={th}>{labels.th_warehouse}</th>}
              <th className={th}>{labels.th_type}</th>
              <th className={th}>{labels.th_position}</th>
              <th className={th}>{labels.th_total_stock}</th>
              <th className={th}>{labels.th_role}</th>
              <th className={`${th} text-right`}>{labels.th_skus}</th>
              <th className={`${th} w-14`} />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <EmptyRow colSpan={colCount} text={q ? labels.no_results : labels.empty} />
            ) : (
              shown.map((l) => {
                const type = typeByCode.get(l.type);
                return (
                  <tr
                    key={l.id}
                    onClick={() => setOpen(l)}
                    className="border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                  >
                    <td className={`${td} font-mono text-amber-500`}>{l.code}</td>
                    {multiWarehouse && (
                      <td className={`${td} text-zinc-400`}>{warehouseName.get(l.warehouseId) ?? dash}</td>
                    )}
                    <td className={`${td} text-zinc-400`}>{type?.name ?? l.type}</td>
                    <td className={`${td} font-mono text-zinc-400`}>
                      {l.area != null ? `${l.area} · ${l.x} · ${l.y}` : dash}
                    </td>
                    <td className={td}>
                      {l.countsInTotalStock ? (
                        <span className="text-zinc-300">{columnLabel(l.stockColumnId, columns, labels)}</span>
                      ) : (
                        <span className="text-zinc-600">{labels.not_counted}</span>
                      )}
                    </td>
                    <td className={td}>
                      {l.isReceiving || l.isStaging ? (
                        <span className="flex flex-wrap gap-1">
                          {purposeLabels(l, labels).map((p) => (
                            <Badge key={p}>{p}</Badge>
                          ))}
                        </span>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className={`${td} text-right font-mono text-zinc-400`}>{l.skuCount || dash}</td>
                    <td className={td}>
                      <div className="flex justify-end">
                        <IconButton title={labels.btn_edit} onClick={() => setOpen(l)}>
                          <PencilIcon />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {open !== undefined && (
        <LocationModal
          key={open?.id ?? "new"}
          location={open}
          types={types}
          columns={columns}
          warehouses={warehouses}
          // New locations go in the filtered warehouse if it's active,
          // otherwise the default (first active) one.
          initialWarehouseId={
            warehouses.find((w) => w.id === warehouseFilter && w.isActive)?.id ??
            (warehouses.find((w) => w.isActive) ?? warehouses[0])?.id ??
            null
          }
          columnForType={columnForType}
          readOnly={!canEdit}
          labels={labels}
          onClose={() => setOpen(undefined)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------
// Warehouses tab
// ------------------------------------------------------------

function WarehousesTab({
  warehouses,
  locations,
  canEdit,
  labels,
}: {
  warehouses: WarehouseRow[];
  locations: LocationRowData[];
  canEdit: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // undefined = closed, null = adding a new warehouse
  const [open, setOpen] = useState<WarehouseRow | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeById = useMemo(() => new Map(locations.map((l) => [l.id, l.code])), [locations]);
  const defaultId = (warehouses.find((w) => w.isActive) ?? warehouses[0])?.id ?? null;
  const activeCount = warehouses.filter((w) => w.isActive).length;

  const q = search.trim().toLowerCase();
  const shown = q ? warehouses.filter((w) => w.name.toLowerCase().includes(q)) : warehouses;

  // Display order: the first active warehouse is the default.
  async function handleMove(index: number, direction: -1 | 1) {
    const ids = warehouses.map((w) => w.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    setError(null);
    const res = await fetch("/api/warehouses/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await readError(res, "Failed to reorder")).error);
      return;
    }
    router.refresh();
  }

  const small =
    "px-2 py-1 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

  return (
    <>
      <p className="text-xs text-zinc-500 mb-4 max-w-2xl">{labels.warehouses_description}</p>

      <Toolbar
        search={search}
        onSearch={setSearch}
        placeholder={labels.search_warehouses_placeholder}
        buttonLabel={labels.btn_add_warehouse}
        onAdd={canEdit ? () => setOpen(null) : null}
      />

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className={`${th} w-12`}>#</th>
              <th className={th}>{labels.th_name}</th>
              <th className={th}>{labels.th_status}</th>
              <th className={th}>{labels.th_default_receiving}</th>
              <th className={th}>{labels.th_default_staging}</th>
              <th className={`${th} text-right`}>{labels.th_locations}</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <EmptyRow colSpan={7} text={q ? labels.no_results : labels.empty} />
            ) : (
              shown.map((w) => {
                const index = warehouses.indexOf(w);
                return (
                  <tr
                    key={w.id}
                    onClick={() => setOpen(w)}
                    className={`border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer ${w.isActive ? "" : "opacity-60"}`}
                  >
                    <td className={`${td} font-mono text-zinc-600`}>{index + 1}</td>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <span className="text-zinc-200">{w.name}</span>
                        {w.id === defaultId && warehouses.length > 1 && (
                          <Badge tone="zinc">{labels.warehouse_default_badge}</Badge>
                        )}
                      </span>
                    </td>
                    <td className={td}>
                      {w.isActive ? (
                        <span className="text-emerald-400">{labels.status_active}</span>
                      ) : (
                        <Badge tone="zinc">{labels.status_inactive}</Badge>
                      )}
                    </td>
                    <td className={`${td} font-mono text-zinc-400`}>
                      {w.defaultReceivingLocationId ? codeById.get(w.defaultReceivingLocationId) ?? dash : dash}
                    </td>
                    <td className={`${td} font-mono text-zinc-400`}>
                      {w.defaultStagingLocationId ? codeById.get(w.defaultStagingLocationId) ?? dash : dash}
                    </td>
                    <td className={`${td} text-right font-mono text-zinc-400`}>{w.locationCount.toLocaleString()}</td>
                    <td className={td}>
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {canEdit && !q && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleMove(index, -1)}
                              disabled={busy || index === 0}
                              title={labels.warehouse_move_up}
                              aria-label={labels.warehouse_move_up}
                              className={small}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMove(index, 1)}
                              disabled={busy || index === warehouses.length - 1}
                              title={labels.warehouse_move_down}
                              aria-label={labels.warehouse_move_down}
                              className={small}
                            >
                              ↓
                            </button>
                          </>
                        )}
                        <IconButton title={labels.btn_edit} onClick={() => setOpen(w)}>
                          <PencilIcon />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {open !== undefined && (
        <WarehouseModal
          key={open?.id ?? "new"}
          warehouse={open}
          isDefault={!!open && open.id === defaultId}
          activeCount={activeCount}
          total={warehouses.length}
          readOnly={!canEdit}
          labels={labels}
          onClose={() => setOpen(undefined)}
        />
      )}
    </>
  );
}
