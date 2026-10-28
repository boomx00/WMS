"use client";

import { formatDateTime } from "@/lib/formatDateTime";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";
import { usePageLabels } from "@/lib/hooks/usePageLabels";

// Shown when "unpick" isn't in lib/pageLabels.ts yet.
const UNPICK_LABELS = { unpick: "Un-pick" };
type Row = {
  id: number;
  type: string;
  itemSku: string;
  itemName: string;
  sourceCode: string | null;
  destinationCode: string | null;
  soNumber: string | null;
  tambahanNumber: string | null;
  workOrderNumber: string | null; // MO number, on inbound events
  supplierName?: string | null; // its own supplier (production inbound), else the product's
  quantity: number;
  username: string;
  createdAt: string | Date;
  finalStock: number | null;
};

const TYPE_STYLES: Record<string, string> = {
  INBOUND: "bg-blue-950 text-blue-300",
  DEFAULT_INBOUND: "bg-cyan-950 text-cyan-300",
  PICKING: "bg-amber-950 text-amber-300",
  UNPICK: "bg-orange-950 text-orange-300",
  DEFAULT_PICKING: "bg-purple-950 text-purple-300",
  MOVE: "bg-indigo-950 text-indigo-300",
  DEFAULT_MOVE: "bg-fuchsia-950 text-fuchsia-300",
  SHIP: "bg-red-950 text-red-300",
  ADJUSTMENT: "bg-teal-950 text-teal-300",
  OTHER_INBOUND: "bg-sky-950 text-sky-300",
  OTHER_OUTBOUND: "bg-rose-950 text-rose-300",
  DELETE_SO: "bg-red-900 text-red-100",
};

// The document an event belongs to: its SO (or Tambahan), or for an inbound
// its MO number.
const docNumber = (row: Row) => row.soNumber ?? row.tambahanNumber ?? row.workOrderNumber ?? null;



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
  // The product's Type / Brand / Tags (Items page).
  const [itemTypeFilter, setItemTypeFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [attributeOptions, setAttributeOptions] = useState<{
    types: string[];
    brands: string[];
    tags: string[];
    suppliers: { id: number; name: string }[];
  } | null>(null);

  const [searchResults, setSearchResults] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeSearchLabel, setActiveSearchLabel] = useState("");

  // Tracks the in-flight quick search so older responses can't overwrite newer ones
  const quickSearchAbortRef = useRef<AbortController | null>(null);
  const labels = usePageLabels("movement_history_page", UNPICK_LABELS)

  const TYPE_LABELS: Record<string, string> = {
  INBOUND: labels.inbound,
  DEFAULT_INBOUND: labels.default_inbound,
  PICKING:  labels.picking,
  UNPICK: labels.unpick,
  DEFAULT_PICKING:  labels.default_picking,
  MOVE:  labels.move,
  DEFAULT_MOVE:  labels.default_move,
  SHIP: labels.ship,
  ADJUSTMENT:  labels.adjustment,
  OTHER_INBOUND: labels.other_inbound,
  OTHER_OUTBOUND: labels.other_outbound,
  DELETE_SO: labels.delete_so,
};
  // Quick search stays debounced-as-you-type, only active in simple mode.
  useEffect(() => {
    if (advancedMode) return;

    if (!search.trim()) {
      quickSearchAbortRef.current?.abort(); // drop anything still in flight
      quickSearchAbortRef.current = null;
      setSearching(false);
      setSearchResults(null);
      return;
    }

    const handle = setTimeout(() => {
      runQuickSearch(search.trim());
    }, 300);

    return () => clearTimeout(handle);
  }, [search, advancedMode]);

  // Product Type / Brand / Tag choices, loaded the first time Advanced
  // Search is opened.
  useEffect(() => {
    if (!advancedMode || attributeOptions) return;
    let cancelled = false;
    fetch("/api/items/attributes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setAttributeOptions(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [advancedMode, attributeOptions]);

  // Abort any pending quick search on unmount
  useEffect(() => {
    return () => quickSearchAbortRef.current?.abort();
  }, []);

  async function runQuickSearch(query: string) {
    // Cancel the previous request — its result is no longer wanted
    quickSearchAbortRef.current?.abort();
    const ctrl = new AbortController();
    quickSearchAbortRef.current = ctrl;

    setSearching(true);
    try {
      const res = await fetch(
        `/api/movement-history-v2/search?q=${encodeURIComponent(query)}`,
        { signal: ctrl.signal }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (ctrl.signal.aborted) return; // a newer search superseded this one
      setSearchResults(data);
      setActiveSearchLabel(`"${query}"`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("Quick search failed:", e);
    } finally {
      // Only the latest request is allowed to turn the spinner off
      if (quickSearchAbortRef.current === ctrl) {
        setSearching(false);
        quickSearchAbortRef.current = null;
      }
    }
  }

  async function runAdvancedSearch() {
    const params = new URLSearchParams();
    if (skuFilter.trim()) params.set("sku", skuFilter.trim());
    if (locationFilter.trim()) params.set("location", locationFilter.trim());
    if (userFilter.trim()) params.set("user", userFilter.trim());
    if (soFilter.trim()) params.set("so", soFilter.trim());
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    if (itemTypeFilter) params.set("itemType", itemTypeFilter);
    if (brandFilter) params.set("brand", brandFilter);
    if (tagFilter.length > 0) params.set("tags", tagFilter.join(","));
    if (supplierFilter) params.set("supplierId", supplierFilter);

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

  // Re-runs whichever search is currently active (advanced or quick), or
  // refreshes the server-rendered default page if neither is active.
  function handleRefresh() {
    if (advancedMode) {
      runAdvancedSearch();
    } else if (search.trim()) {
      runQuickSearch(search.trim());
    } else {
      router.refresh();
    }
  }

  function clearAdvancedFilters() {
    setSkuFilter("");
    setLocationFilter("");
    setUserFilter("");
    setSoFilter("");
    setTypeFilter("ALL");
    setItemTypeFilter("");
    setBrandFilter("");
    setTagFilter([]);
    setSupplierFilter("");
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
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.page_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {labels.header_description}
        </p>
      </header>

      {!advancedMode ? (
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.search_placeholder}
            className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={toggleAdvanced}
            className="px-3 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors whitespace-nowrap"
          >
            {labels.advanced_search}
          </button>
          <RefreshButton onClick={handleRefresh} loading={searching} />
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              {labels.advanced_search}
            </span>
            <button
              onClick={toggleAdvanced}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
{labels.back_to_quick_search}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.sku_product}</label>
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
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.location}</label>
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
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.user}</label>
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
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.doc_number}</label>
              <input
                type="text"
                value={soFilter}
                onChange={(e) => setSoFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAdvancedSearch()}
                placeholder="SO / MO, e.g. SO-202608"
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.type}</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              >
                <option className="text-sm" value="ALL">{labels.all_types}</option>
                <option className="text-sm" value="INBOUND">{labels.inbound}</option>
                <option className="text-sm" value="DEFAULT_INBOUND">{labels.default_inbound}</option>
                <option className="text-sm" value="PICKING">{labels.picking}</option>
                <option className="text-sm" value="DEFAULT_PICKING">{labels.default_picking}</option>
                <option className="text-sm" value="UNPICK">{labels.unpick}</option>
                <option className="text-sm" value="MOVE">{labels.move}</option>
                <option className="text-sm" value="DEFAULT_MOVE">{labels.default_move}</option>
                <option className="text-sm" value="SHIP">{labels.ship}</option>
                <option className="text-sm" value="ADJUSTMENT">{labels.adjustment}</option>
                <option className="text-sm" value="OTHER_INBOUND">{labels.other_inbound}</option>
                <option className="text-sm" value="OTHER_OUTBOUND">{labels.other_outbound}</option>
                <option className="text-sm" value="DELETE_SO">{labels.delete_so}</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.item_type}</label>
              <select
                value={itemTypeFilter}
                onChange={(e) => setItemTypeFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              >
                <option className="text-sm" value="">{labels.all_item_types}</option>
                {(attributeOptions?.types ?? []).map((t) => (
                  <option key={t} className="text-sm" value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.brand}</label>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              >
                <option className="text-sm" value="">{labels.all_brands}</option>
                {(attributeOptions?.brands ?? []).map((b) => (
                  <option key={b} className="text-sm" value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">{labels.supplier}</label>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              >
                <option className="text-sm" value="">{labels.all_suppliers}</option>
                {(attributeOptions?.suppliers ?? []).map((sup) => (
                  <option key={sup.id} className="text-sm" value={String(sup.id)}>{sup.name}</option>
                ))}
                <option className="text-sm" value="none">{labels.no_supplier}</option>
              </select>
            </div>
          </div>

          {(attributeOptions?.tags.length ?? 0) > 0 && (
            <div className="mb-3">
              <span className="block text-[11px] text-zinc-500 mb-1">
                {labels.tags} <span className="text-zinc-600">· {labels.tags_hint}</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {attributeOptions!.tags.map((tag) => {
                  const on = tagFilter.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter((cur) => (on ? cur.filter((t) => t !== tag) : [...cur, tag]))}
                      className={`px-2 py-0.5 rounded-full border text-xs font-mono transition-colors ${
                        on
                          ? "border-amber-500 bg-amber-500/15 text-amber-300"
                          : "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={runAdvancedSearch}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 transition-colors"
            >
              {labels.search}
            </button>
            <button
              onClick={clearAdvancedFilters}
              className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            >
              {labels.clear}
            </button>
            <RefreshButton onClick={handleRefresh} loading={searching} />
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-600 mb-3">
        {searching
          ? "Searching..."
          : isSearchActive
            ? `${(searchResults ?? []).length.toLocaleString()} result(s) for ${activeSearchLabel}`
            : `Page ${page} of ${totalPages} · ${labels.total }${totalCount.toLocaleString()} ${labels.events}`}
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-x-auto mb-4">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-4 py-3 font-medium">{labels.type}</th>
              <th className="px-4 py-3 font-medium">{labels.product}</th>
              <th className="px-4 py-3 font-medium">{labels.from}</th>
              <th className="px-4 py-3 font-medium">{labels.to}</th>
              <th className="px-4 py-3 font-medium">{labels.doc}</th>
              <th className="px-4 py-3 font-medium text-right">{labels.qty}</th>
              <th className="px-4 py-3 font-medium text-right">{labels.final_stock_to}</th>
              <th className="px-4 py-3 font-medium">{labels.user}</th>
              <th className="px-4 py-3 font-medium text-right">{labels.when}</th>
            </tr>
          </thead>
          <tbody>
            {(isSearchActive ? searchResults ?? [] : rows).length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-zinc-600">
                  {labels.no_matching_events}
                </td>
              </tr>
            ) : (
              (isSearchActive ? searchResults ?? [] : rows).map((row) => (
                <tr key={row.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        TYPE_STYLES[row.type] ?? "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {TYPE_LABELS[row.type] ?? row.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-zinc-300">{row.itemSku}</span><br></br>
                    <span className="text-zinc-500 text-xs">{row.itemName}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-amber-500">{row.sourceCode ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-amber-500">
                    {row.type === "SHIP" ? (row.soNumber ?? row.tambahanNumber ?? "—") : (row.destinationCode ?? "—")}
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300">
                    {docNumber(row) ?? "—"}
                    {row.supplierName && (
                      <div className="font-sans text-[11px] text-zinc-500">{row.supplierName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{row.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">
                    {row.finalStock === null ? "—" : row.finalStock.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{row.username}</td>
                  <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                    {formatDateTime(row.createdAt)}
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
            ← {labels.previous}
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {labels.next} →
          </button>
        </div>
      )}
    </div>
  );
}