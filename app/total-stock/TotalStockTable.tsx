"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";

export type SkuLocation = {
  locationCode: string;
  locationType: string;
  locationArea: string | null;
  quantity: number;
  updatedAt: string;
};

export type SkuStock = {
  itemId: number;
  sku: string;
  name: string;
  palletCartonQty: number;
  totalQuantity: number;
  locations: SkuLocation[];
};

type Filters = {
  sku: string;
  name: string;
  locMin: string;
  locMax: string;
  totalMin: string;
  totalMax: string;
  palletMin: string;
  palletMax: string;
};

const EMPTY_FILTERS: Filters = {
  sku: "",
  name: "",
  locMin: "",
  locMax: "",
  totalMin: "",
  totalMax: "",
  palletMin: "",
  palletMax: "",
};

const TYPE_LABELS: Record<string, string> = {
  FLOOR: "Floor",
  OUTBOUND_WH: "Outbound WH",
  DESTROY: "Destroy",
  LEFTOVER: "Leftover",
};

function typeLabel(loc: SkuLocation): string {
  if (loc.locationType === "RACK") {
    return loc.locationArea ? `Rack · Area ${loc.locationArea}` : "Rack";
  }
  return TYPE_LABELS[loc.locationType] ?? loc.locationType;
}

function palletValue(quantity: number, palletCartonQty: number): number | null {
  if (!palletCartonQty || palletCartonQty <= 0) return null;
  return quantity / palletCartonQty;
}

function formatPallets(quantity: number, palletCartonQty: number): string {
  const num = palletValue(quantity, palletCartonQty);
  if (num === null) return "—";
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, "");
}

// Empty min/max means "no limit". A null value (e.g. an SKU with no pallet
// size set) is excluded whenever a range is actually being applied.
function withinRange(value: number | null, min: string, max: string): boolean {
  const lo = min.trim() === "" ? null : Number(min);
  const hi = max.trim() === "" ? null : Number(max);
  const hasLo = lo !== null && !Number.isNaN(lo);
  const hasHi = hi !== null && !Number.isNaN(hi);

  if (!hasLo && !hasHi) return true;
  if (value === null) return false;
  if (hasLo && value < (lo as number)) return false;
  if (hasHi && value > (hi as number)) return false;
  return true;
}

const inputClass =
  "px-2 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-normal text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500";

function RangeFilter({
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        step="any"
        value={min}
        onChange={(e) => onMinChange(e.target.value)}
        placeholder="Min"
        aria-label="Minimum"
        className={`${inputClass} w-16 text-right`}
      />
      <span className="text-zinc-600">–</span>
      <input
        type="number"
        step="any"
        value={max}
        onChange={(e) => onMaxChange(e.target.value)}
        placeholder="Max"
        aria-label="Maximum"
        className={`${inputClass} w-16 text-right`}
      />
    </div>
  );
}

export default function TotalStockTable({ skus }: { skus: SkuStock[] }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function setFilter<K extends keyof Filters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const hasActiveFilters = Object.values(filters).some((v) => v.trim() !== "");

  const filtered = useMemo(() => {
    const skuQ = filters.sku.trim().toLowerCase();
    const nameQ = filters.name.trim().toLowerCase();

    return skus.filter((s) => {
      if (skuQ && !s.sku.toLowerCase().includes(skuQ)) return false;
      if (nameQ && !s.name.toLowerCase().includes(nameQ)) return false;
      if (!withinRange(s.locations.length, filters.locMin, filters.locMax)) return false;
      if (!withinRange(s.totalQuantity, filters.totalMin, filters.totalMax)) return false;
      if (
        !withinRange(
          palletValue(s.totalQuantity, s.palletCartonQty),
          filters.palletMin,
          filters.palletMax
        )
      )
        return false;
      return true;
    });
  }, [skus, filters]);

  // Card totals follow whatever the filters currently leave visible.
  const grandTotal = useMemo(
    () => filtered.reduce((sum, s) => sum + s.totalQuantity, 0),
    [filtered]
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

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">SKUs in stock</p>
          <p className="text-lg font-semibold">{filtered.length.toLocaleString()}</p>
        </div>
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">Total stock (cartons)</p>
          <p className="text-lg font-semibold">{grandTotal.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs text-zinc-600">
          Showing {filtered.length.toLocaleString()} of {skus.length.toLocaleString()} SKU(s)
        </p>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="px-3 py-1.5 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              Clear filters
            </button>
          )}
          <RefreshButton onClick={handleRefresh} loading={isRefreshing} />
        </div>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium text-right">Locations</th>
              <th className="px-4 py-3 font-medium text-right">Total (cartons)</th>
              <th className="px-4 py-3 font-medium text-right">Pallets</th>
            </tr>
            <tr className="bg-zinc-900 border-t border-zinc-800">
              <th className="px-4 pb-3"></th>
              <th className="px-4 pb-3">
                <input
                  type="text"
                  value={filters.sku}
                  onChange={(e) => setFilter("sku", e.target.value)}
                  placeholder="Filter SKU..."
                  className={`${inputClass} w-full font-mono`}
                />
              </th>
              <th className="px-4 pb-3">
                <input
                  type="text"
                  value={filters.name}
                  onChange={(e) => setFilter("name", e.target.value)}
                  placeholder="Filter product..."
                  className={`${inputClass} w-full`}
                />
              </th>
              <th className="px-4 pb-3">
                <RangeFilter
                  min={filters.locMin}
                  max={filters.locMax}
                  onMinChange={(v) => setFilter("locMin", v)}
                  onMaxChange={(v) => setFilter("locMax", v)}
                />
              </th>
              <th className="px-4 pb-3">
                <RangeFilter
                  min={filters.totalMin}
                  max={filters.totalMax}
                  onMinChange={(v) => setFilter("totalMin", v)}
                  onMaxChange={(v) => setFilter("totalMax", v)}
                />
              </th>
              <th className="px-4 pb-3">
                <RangeFilter
                  min={filters.palletMin}
                  max={filters.palletMax}
                  onMinChange={(v) => setFilter("palletMin", v)}
                  onMaxChange={(v) => setFilter("palletMax", v)}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                  {hasActiveFilters ? "No SKUs match the current filters." : "No stock recorded."}
                </td>
              </tr>
            ) : (
              filtered.map((sku) => {
                const open = expanded.has(sku.itemId);

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
                      <td className="px-4 py-3 text-right font-mono">
                        {sku.totalQuantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-400">
                        {formatPallets(sku.totalQuantity, sku.palletCartonQty)}
                      </td>
                    </tr>

                    {open && (
                      <tr className="bg-zinc-950/40">
                        <td colSpan={6} className="pl-12 pr-4 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-zinc-500 text-left">
                                <th className="py-2 pr-4 font-medium">Location</th>
                                <th className="py-2 pr-4 font-medium">Type</th>
                                <th className="py-2 pr-4 font-medium text-right">Quantity</th>
                                <th className="py-2 pr-4 font-medium text-right">Pallets</th>
                                <th className="py-2 font-medium text-right">Updated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sku.locations.map((loc) => (
                                <tr
                                  key={loc.locationCode}
                                  className="border-t border-zinc-800/70"
                                >
                                  <td className="py-2 pr-4 font-mono text-zinc-300">
                                    {loc.locationCode}
                                  </td>
                                  <td className="py-2 pr-4 text-zinc-400">{typeLabel(loc)}</td>
                                  <td className="py-2 pr-4 text-right font-mono">
                                    {loc.quantity.toLocaleString()}
                                  </td>
                                  <td className="py-2 pr-4 text-right font-mono text-zinc-400">
                                    {formatPallets(loc.quantity, sku.palletCartonQty)}
                                  </td>
                                  <td className="py-2 text-right font-mono text-xs text-zinc-500">
                                    {loc.updatedAt}
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
    </div>
  );
}