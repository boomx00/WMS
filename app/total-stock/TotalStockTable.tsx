"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";
import LedgerModal from "./LedgerModal";
import LocationLedgerModal from "./LocationLedgerModal";
import { downloadXlsx } from "./exportLedgerXlsx";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { TOTAL_STOCK_WAREHOUSE_LABELS } from "@/lib/warehouseLabels";
import { useLanguage } from "@/lib/LanguageContext";
import { columnNameFor } from "@/lib/columnNames";

export type SkuLocation = {
  locationCode: string;
  locationType: string;
  locationArea: string | null;
  stockColumnId: number | null; // Total Stock column; null = total only
  quantity: number;
  updatedAt: string;
};

// A Total Stock column from Settings → Total Stock Columns, with its
// optional Indonesian / Chinese names.
export type StockColumn = { id: number; name: string; nameId?: string | null; nameZh?: string | null };

export type SkuStock = {
  itemId: number;
  sku: string;
  name: string;
  palletCartonQty: number;
  totalQuantity: number;
  locations: SkuLocation[];
};

// `col:<id>` sorts by one Total Stock column.
type SortKey = "sku" | "name" | "locations" | "total" | "pallets" | `col:${number}`;
type SortDir = "asc" | "desc";

function palletValue(quantity: number, palletCartonQty: number): number | null {
  if (!palletCartonQty || palletCartonQty <= 0) return null;
  return quantity / palletCartonQty;
}

function formatPallets(quantity: number, palletCartonQty: number): string {
  const num = palletValue(quantity, palletCartonQty);
  if (num === null) return "—";
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, "");
}

// Quantity per Total Stock column for one SKU. Each location sits in at
// most one column ("Shown under" on the Locations page). Total still
// includes locations shown under no column ("Total only"), so it won't
// always equal the sum of the columns.
function columnTotals(sku: SkuStock): Map<number, number> {
  const totals = new Map<number, number>();
  for (const l of sku.locations) {
    if (l.stockColumnId === null) continue;
    totals.set(l.stockColumnId, (totals.get(l.stockColumnId) ?? 0) + l.quantity);
  }
  return totals;
}

function exportRow(sku: SkuStock, columns: StockColumn[]): (string | number)[] {
  const totals = columnTotals(sku);
  return [sku.sku, sku.name, ...columns.map((c) => totals.get(c.id) ?? 0), sku.totalQuantity];
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;

  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-zinc-100 transition-colors ${
          active ? "text-zinc-200" : ""
        }`}
      >
        {label}
        <span className={`text-[10px] ${active ? "text-amber-500" : "text-zinc-700"}`}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export type WarehouseTab = { id: number; name: string; isActive: boolean };

export default function TotalStockTable({
  skus,
  columns,
  warehouses,
  activeWarehouseId,
}: {
  skus: SkuStock[];
  columns: StockColumn[]; // the active warehouse's
  warehouses: WarehouseTab[]; // one tab each
  activeWarehouseId: number | null;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [ledgerSku, setLedgerSku] = useState<string | null>(null);
  const [locationLedger, setLocationLedger] = useState<{ sku: string; location: string } | null>(null);
    const labels = usePageLabels("total_stock", TOTAL_STOCK_WAREHOUSE_LABELS);
  const { language } = useLanguage();

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? skus.filter(
          (s) => s.sku.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
        )
      : skus;

    const dirMul = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "sku":
          return dirMul * a.sku.localeCompare(b.sku, undefined, { numeric: true });
        case "name":
          return dirMul * a.name.localeCompare(b.name, undefined, { numeric: true });
        case "locations":
          return dirMul * (a.locations.length - b.locations.length);
        case "total":
          return dirMul * (a.totalQuantity - b.totalQuantity);
        case "pallets": {
          const pa = palletValue(a.totalQuantity, a.palletCartonQty);
          const pb = palletValue(b.totalQuantity, b.palletCartonQty);
          if (pa === null && pb === null) return 0;
          if (pa === null) return 1;
          if (pb === null) return -1;
          return dirMul * (pa - pb);
        }
        default: {
          const columnId = Number(sortKey.slice(4));
          return dirMul * ((columnTotals(a).get(columnId) ?? 0) - (columnTotals(b).get(columnId) ?? 0));
        }
      }
    });
  }, [skus, search, sortKey, sortDir]);

  const grandTotal = useMemo(
    () => visible.reduce((sum, s) => sum + s.totalQuantity, 0),
    [visible]
  );

  function toggle(itemId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleRefresh() {
    startRefresh(() => {
      router.refresh();
    });
  }

  const activeWarehouse = warehouses.find((w) => w.id === activeWarehouseId) ?? null;

  function exportAll() {
    const rows = skus.map((sku) => exportRow(sku, columns));
    const tabPart =
      warehouses.length > 1 && activeWarehouse
        ? `-${activeWarehouse.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
        : "";
    downloadXlsx(
      `total-stock${tabPart}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      ["SKU CODE", "SKU NAME", ...columns.map((c) => columnNameFor(c, language).toUpperCase()), "TOTAL"],
      rows
    );
  }

  // Arrow, SKU, product, locations, one per column, total, pallets, ledger.
  const colCount = 7 + columns.length;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.total_stock_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {labels.header_description}
        </p>
      </header>
      {warehouses.length > 0 && (
        <nav aria-label={labels.warehouse_tabs} className="flex flex-wrap gap-1 mb-6 border border-zinc-800 rounded-lg p-1 w-fit">
          {warehouses.map((w) => {
            const active = w.id === activeWarehouseId;
            return (
              <Link
                key={w.id}
                href={`/total-stock?warehouse=${w.id}`}
                aria-current={active ? "page" : undefined}
                className={`px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  active ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {w.name}
                {!w.isActive && (
                  <span className={`ml-1.5 text-[10px] uppercase tracking-wide ${active ? "text-zinc-800" : "text-zinc-600"}`}>
                    {labels.warehouse_inactive}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">{labels.sku_in_stock_card}</p>
          <p className="text-lg font-semibold">{visible.length.toLocaleString()}</p>
        </div>
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">{labels.total_stock_card}</p>
          <p className="text-lg font-semibold">{grandTotal.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by SKU or product name..."
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
        <RefreshButton onClick={handleRefresh} loading={isRefreshing} />
        <button
          onClick={exportAll}
          className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
        >
          {labels.export_data}
        </button>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium w-8"></th>
              <SortableTh label={labels.th_sku} sortKey="sku" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label={labels.th_product} sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label={labels.th_location} sortKey="locations" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              {columns.map((c) => (
                <SortableTh
                  key={c.id}
                  label={columnNameFor(c, language)}
                  sortKey={`col:${c.id}`}
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              ))}
              <SortableTh label={labels.th_total_carton} sortKey="total" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <SortableTh label={labels.th_pallets} sortKey="pallets" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <th className="px-4 py-3 font-medium text-right">{labels.th_ledger}</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-zinc-600">
                  {search.trim() ? "No SKUs match your search." : "No stock recorded."}
                </td>
              </tr>
            ) : (
              visible.map((sku) => {
                const open = expanded.has(sku.itemId);
                const totals = columnTotals(sku);

                return (
                  <Fragment key={sku.itemId}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => toggle(sku.itemId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle(sku.itemId);
                        }
                      }}
                      className="border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`text-zinc-500 text-xs inline-block transition-transform ${
                            open ? "rotate-90" : ""
                          }`}
                        >
                          ▶
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{sku.sku}</td>
                      <td className="px-4 py-3">{sku.name}</td>
                      <td className="px-4 py-3 text-right text-zinc-400">
                        {sku.locations.length.toLocaleString()}
                      </td>
                      {columns.map((c) => (
                        <td key={c.id} className="px-4 py-3 text-right font-mono text-zinc-400">
                          {(totals.get(c.id) ?? 0).toLocaleString()}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-mono">
                        {sku.totalQuantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-400">
                        {formatPallets(sku.totalQuantity, sku.palletCartonQty)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLedgerSku(sku.sku);
                          }}
                          className="px-3 py-1.5 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
                        >
                          {labels.details_button}
                        </button>
                      </td>
                    </tr>

                    {open && (
                      <tr className="bg-zinc-950/40">
                        <td colSpan={colCount} className="pl-12 pr-4 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-zinc-500 text-left">
                                <th className="py-2 pr-4 font-medium">{labels.th_location}</th>
                                <th className="py-2 pr-4 font-medium text-right">{labels.th_quantity}</th>
                                <th className="py-2 pr-4 font-medium text-right">{labels.th_pallets}</th>
                                <th className="py-2 pr-4 font-medium text-right">{labels.th_updated}</th>
                                <th className="py-2 font-medium text-right">{labels.th_ledger}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sku.locations.map((loc) => (
                                <tr key={loc.locationCode} className="border-t border-zinc-800/70">
                                  <td className="py-2 pr-4 font-mono text-zinc-300">
                                    {loc.locationCode}
                                  </td>
                                  <td className="py-2 pr-4 text-right font-mono">
                                    {loc.quantity.toLocaleString()}
                                  </td>
                                  <td className="py-2 pr-4 text-right font-mono text-zinc-400">
                                    {formatPallets(loc.quantity, sku.palletCartonQty)}
                                  </td>
                                  <td className="py-2 pr-4 text-right font-mono text-xs text-zinc-500">
                                    {loc.updatedAt}
                                  </td>
                                  <td className="py-2 text-right">
                                    <button
                                      onClick={() =>
                                        setLocationLedger({ sku: sku.sku, location: loc.locationCode })
                                      }
                                      className="px-2 py-1 rounded-md border border-zinc-800 text-[10px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
                                    >
                                      {labels.th_ledger}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {ledgerSku && (
        <LedgerModal
          key={ledgerSku}
          sku={ledgerSku}
          warehouseId={activeWarehouseId}
          onClose={() => setLedgerSku(null)}
        />
      )}
      {locationLedger && (
        <LocationLedgerModal
          key={`${locationLedger.sku}-${locationLedger.location}`}
          sku={locationLedger.sku}
          location={locationLedger.location}
          onClose={() => setLocationLedger(null)}
        />
      )}
    </div>
  );
}