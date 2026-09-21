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

type SortKey = "sku" | "name" | "locations" | "total" | "pallets";
type SortDir = "asc" | "desc";

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

export default function TotalStockTable({ skus }: { skus: SkuStock[] }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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
          // SKUs with no pallet size set always sink to the bottom,
          // whichever direction is active.
          if (pa === null && pb === null) return 0;
          if (pa === null) return 1;
          if (pb === null) return -1;
          return dirMul * (pa - pb);
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

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">SKUs in stock</p>
          <p className="text-lg font-semibold">{visible.length.toLocaleString()}</p>
        </div>
        <div className="border border-zinc-800 rounded-lg px-4 py-3">
          <p className="text-xs text-zinc-500 mb-1">Total stock (cartons)</p>
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
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium w-8"></th>
              <SortableTh label="SKU" sortKey="sku" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Product" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Locations" sortKey="locations" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <SortableTh label="Total (cartons)" sortKey="total" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <SortableTh label="Pallets" sortKey="pallets" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-600">
                  {search.trim() ? "No SKUs match your search." : "No stock recorded."}
                </td>
              </tr>
            ) : (
              visible.map((sku) => {
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