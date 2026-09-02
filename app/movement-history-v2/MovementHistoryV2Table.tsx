"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: number;
  type: string;
  itemSku: string;
  itemName: string;
  sourceCode: string | null;
  destinationCode: string | null;
  soNumber: string | null;
  quantity: number;
  username: string;
  createdAt: string | Date;
  finalStock: number | null;
};

const TYPE_STYLES: Record<string, string> = {
  INBOUND: "bg-blue-950 text-blue-300",
  DEFAULT_INBOUND: "bg-cyan-950 text-cyan-300",
  PICKING: "bg-amber-950 text-amber-300",
  DEFAULT_PICKING: "bg-purple-950 text-purple-300",
  MOVE: "bg-indigo-950 text-indigo-300",
  DEFAULT_MOVE: "bg-fuchsia-950 text-fuchsia-300",
  SHIP: "bg-red-950 text-red-300",
  ADJUSTMENT: "bg-teal-950 text-teal-300",
};

const TYPE_LABELS: Record<string, string> = {
  INBOUND: "INBOUND",
  DEFAULT_INBOUND: "DEFAULT INBOUND",
  PICKING: "PICKING",
  DEFAULT_PICKING: "DEFAULT PICKING",
  MOVE: "MOVE",
  DEFAULT_MOVE: "DEFAULT MOVE",
  SHIP: "SHIP",
  ADJUSTMENT: "ADJUSTMENT",
};

export default function MovementHistoryV2Table({
  rows,
  page,
  totalPages,
  totalCount,
}: {
  rows: Row[];
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const router = useRouter();

  const [advancedMode, setAdvancedMode] = useState(false);

  // Simple quick-search (unchanged behavior — debounced, OR-matched)
  const [search, setSearch] = useState("");

  // Advanced search — each field ANDed together, submitted explicitly
  const [skuFilter, setSkuFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [soFilter, setSoFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const [searchResults, setSearchResults] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeSearchLabel, setActiveSearchLabel] = useState("");

  // Quick search stays debounced-as-you-type, only active in simple mode.
  useEffect(() => {
    if (advancedMode) return;

    if (!search.trim()) {
      setSearchResults(null);
      return;
    }

    const handle = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/movement-history-v2/search?q=${encodeURIComponent(search.trim())}`);
      setSearching(false);
      if (res.ok) {
        setSearchResults(await res.json());
        setActiveSearchLabel(`"${search.trim()}"`);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [search, advancedMode]);

  async function runAdvancedSearch() {
    const params = new URLSearchParams();
    if (skuFilter.trim()) params.set("sku", skuFilter.trim());
    if (locationFilter.trim()) params.set("location", locationFilter.trim());
    if (userFilter.trim()) params.set("user", userFilter.trim());
    if (soFilter.trim()) params.set("so", soFilter.trim());
    if (typeFilter !== "ALL") params.set("type", typeFilter);

    if ([...params.keys()].length === 0) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    const res = await fetch(`/api/movement-history-v2/search?${params.toString()}`);
    setSearching(false);
    if (res.ok) {
      setSearchResults(await res.json());
      setActiveSearchLabel("advanced filters");
    }
  }

  function clearAdvancedFilters() {
    setSkuFilter("");
    setLocationFilter("");
    setUserFilter("");
    setSoFilter("");
    setTypeFilter("ALL");
    setSearchResults(null);
  }

  function toggleAdvanced() {
    setAdvancedMode((prev) => !prev);
    setSearch("");
    setSearchResults(null);
  }

  const isSearchActive = searchResults !== null;

  function goToPage(p: number) {
    router.push(`/movement-history-v2?page=${p}`);
  }

  return (
    <div>
      {!advancedMode ? (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU, product, location, SO number, or user..."
            className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={toggleAdvanced}
            className="px-3 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors whitespace-nowrap"
          >
            Advanced Search
          </button>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Advanced Search
            </span>
            <button
              onClick={toggleAdvanced}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Back to quick search
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">SKU / Product</label>
              <input
                type="text"
                value={skuFilter}
                onChange={(e) => setSkuFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAdvancedSearch()}
                placeholder="e.g. 14013024102"
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Location</label>
              <input
                type="text"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAdvancedSearch()}
                placeholder="From or To, e.g. A1.1"
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">User</label>
              <input
                type="text"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAdvancedSearch()}
                placeholder="Username"
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">SO Number</label>
              <input
                type="text"
                value={soFilter}
                onChange={(e) => setSoFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAdvancedSearch()}
                placeholder="e.g. SO-202608"
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All types</option>
                <option value="INBOUND">Inbound</option>
                <option value="DEFAULT_INBOUND">Default Inbound</option>
                <option value="PICKING">Picking</option>
                <option value="DEFAULT_PICKING">Default Picking</option>
                <option value="MOVE">Move</option>
                <option value="DEFAULT_MOVE">Default Move</option>
                <option value="SHIP">Ship</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={runAdvancedSearch}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 transition-colors"
            >
              Search
            </button>
            <button
              onClick={clearAdvancedFilters}
              className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-600 mb-3">
        {searching
          ? "Searching..."
          : isSearchActive
            ? `${(searchResults ?? []).length.toLocaleString()} result(s) for ${activeSearchLabel}`
            : `Page ${page} of ${totalPages} · ${totalCount.toLocaleString()} events total`}
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium text-right">Qty</th>
              <th className="px-4 py-3 font-medium text-right">Final Stock (To)</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {(isSearchActive ? searchResults ?? [] : rows).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-600">
                  No matching events.
                </td>
              </tr>
            ) : (
              (isSearchActive ? searchResults ?? [] : rows).map((row) => (
                <tr key={row.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        TYPE_STYLES[row.type] ?? "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {TYPE_LABELS[row.type] ?? row.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-zinc-300">{row.itemSku}</span>{" "}
                    <span className="text-zinc-500 text-xs">{row.itemName}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-amber-500">{row.sourceCode ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-amber-500">
                    {row.type === "SHIP" ? (row.soNumber ?? "—") : (row.destinationCode ?? "—")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{row.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">
                    {row.finalStock === null ? "—" : row.finalStock.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{row.username}</td>
                  <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isSearchActive && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}