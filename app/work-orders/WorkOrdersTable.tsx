"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
type Line = {
  workOrderNumber: string;
  itemSku: string;
  itemName: string;
  totalQuantity: number;
  palletCount: number;
  originalInbound: number;
};

type Pallet = {
  palletId: number;
  label: string;
  printedLabel: string | null;
  quantity: number;
  status: string;
  itemSku: string;
  locationCode: string;
  inboundAt: string | Date;
  inboundByUsername: string | null;
};

type WorkOrder = {
  workOrderNumber: string;
  lines: Line[];
  totalQuantity: number;
  totalPallets: number;
  totalOriginalInbound: number;
  firstInboundAt: string | Date | null;
  pallets: Pallet[];
};

type MesRecord = {
  LABEL_NO: string;
  MITEM_CODE: string;
  MITEM_DESC: string;
  LABEL_QTY: number;
  STATUS: string;
  STATUS_STR: string;
  MO_CODE: string;
  // Added by the cross-check route: LABEL_NO rewritten to the current sku
  // (only when the printed code is a recorded legacy_sku). Used for matching
  // only — LABEL_NO stays as printed and is what gets displayed.
  MATCH_KEY?: string;
  CURRENT_SKU?: string | null;
};

type MesCheckState = {
  loading: boolean;
  error: string | null;
  records: MesRecord[] | null;
};

type CrossCheckRow = {
  label: string;
  wms: Pallet | null;
  mes: MesRecord | null;
};

function normalizeLabelForMatch(label: string): string {
  // Leading '*' is a barcode start char that may or may not be captured —
  // ignore it so "*SKU*seq*qty*MO" and "SKU*seq*qty*MO" match each other.
  return label.trim().replace(/^\*+/, "").toUpperCase();
}

// Union of every label seen on either side, so a label that only exists in
// MES (or only in WMS) still gets its own row — with "-" standing in for
// whichever side doesn't have it.
function buildCrossCheckRows(pallets: Pallet[], mesRecords: MesRecord[]): CrossCheckRow[] {
  const wmsByLabel = new Map(pallets.map((p) => [normalizeLabelForMatch(p.label), p]));
  const mesByLabel = new Map(
    mesRecords.map((r) => [normalizeLabelForMatch(r.MATCH_KEY ?? r.LABEL_NO), r])
  );
  const allKeys = new Set([...wmsByLabel.keys(), ...mesByLabel.keys()]);

  return Array.from(allKeys)
    .sort()
    .map((key) => {
      const wms = wmsByLabel.get(key) ?? null;
      const mes = mesByLabel.get(key) ?? null;
      // Prefer the label as printed (MES), so a legacy-coded pallet still
      // shows its physical label even though WMS stores it under the
      // current sku.
      return { label: mes?.LABEL_NO ?? wms?.printedLabel ?? wms?.label ?? key, wms, mes };
    });
}

export default function WorkOrdersTable({
  workOrders,
  page,
  totalPages,
  totalCount,
}: {
  workOrders: WorkOrder[];
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<WorkOrder[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mesChecks, setMesChecks] = useState<Record<string, MesCheckState>>({});
const labels = usePageLabels("work_orders_page")
  // Searches the whole database, not just the 50 work orders on this page —
  // same debounced pattern used on Sales Orders and Movement History (v2).
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }

    const handle = setTimeout(() => {
      runSearch(search.trim());
    }, 300);

    return () => clearTimeout(handle);
  }, [search]);

  async function runSearch(query: string) {
    setSearching(true);
    const res = await fetch(`/api/work-orders/search?q=${encodeURIComponent(query)}`);
    setSearching(false);
    if (res.ok) {
      setSearchResults(await res.json());
    }
  }

  // If a search is active, re-run it against the database; otherwise
  // refresh the server-rendered page — either way, no full reload needed.
  function handleRefresh() {
    if (search.trim()) {
      runSearch(search.trim());
    } else {
      router.refresh();
    }
  }

  const displayed = searchResults ?? workOrders;
  const isSearching = search.trim().length > 0;

  async function runMesCrossCheck(workOrderNumber: string) {
    setMesChecks((prev) => ({
      ...prev,
      [workOrderNumber]: { loading: true, error: null, records: prev[workOrderNumber]?.records ?? null },
    }));

    const res = await fetch(`/api/work-orders/${encodeURIComponent(workOrderNumber)}/mes-cross-check`);
    const data = await res.json();

    setMesChecks((prev) => ({
      ...prev,
      [workOrderNumber]: res.ok
        ? { loading: false, error: null, records: data.records }
        : { loading: false, error: data.error ?? "Failed to cross-check with MES", records: null },
    }));
  }

  function toggle(workOrderNumber: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(workOrderNumber)) next.delete(workOrderNumber);
      else next.add(workOrderNumber);
      return next;
    });
  }

  function goToPage(p: number) {
    router.push(`/work-orders?page=${p}`);
  }

  return (
    <div>
            <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.page_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {labels.header_description}
        </p>
      </header>
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.search_placeholder}
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
        <RefreshButton onClick={handleRefresh} loading={searching} />
      </div>

      <p className="text-xs text-zinc-600 mb-3">
        {searching
          ? "Searching..."
          : isSearching
            ? `${displayed.length.toLocaleString()} result(s) for "${search.trim()}"`
            : `Page ${page} of ${totalPages} · ${labels.total} ${totalCount.toLocaleString()} ${labels.record}`}
      </p>

      <div className="space-y-3 mb-4">
        {displayed.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-12 text-center text-zinc-600 text-sm">
            {isSearching ? labels.no_matching_work_order : "No work orders yet."}
          </div>
        ) : (
          displayed.map((wo) => {
            const isOpen = expanded.has(wo.workOrderNumber);

            return (
              <div
                key={wo.workOrderNumber}
                className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden"
              >
                <button
                  onClick={() => toggle(wo.workOrderNumber)}
                  className="w-full flex items-baseline justify-between p-4 text-left hover:bg-zinc-900/60 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-zinc-500 text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                    <span className="font-mono text-amber-500 text-sm">{wo.workOrderNumber}</span>
                  </span>
                  <span className="text-xs text-zinc-500 text-right">
                    <div>
                      {wo.totalPallets.toLocaleString()} {labels.pallet} ·{" "}
                      <span className="text-zinc-300 font-mono">{wo.totalQuantity.toLocaleString()}</span>{" "}
                      {labels.total_unit}
                    </div>
                    {/* <div className="text-zinc-600 text-[10px]">
                      Originally inbounded: {wo.totalOriginalInbound.toLocaleString()}
                    </div> */}
                    <div className="text-zinc-600 text-[10px]">
                      {labels.first_inbound}:{" "}
                      {wo.firstInboundAt ? new Date(wo.firstInboundAt).toLocaleString() : "—"}
                    </div>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-800 bg-zinc-950/50">
                    {(() => {
                      const mesCheck = mesChecks[wo.workOrderNumber];
                      const rows: CrossCheckRow[] = mesCheck?.records
                        ? buildCrossCheckRows(wo.pallets, mesCheck.records)
                        : wo.pallets.map((p) => ({ label: p.printedLabel ?? p.label, wms: p, mes: null }));
                      const showMesColumn = !!mesCheck?.records;

                      const matched = showMesColumn ? rows.filter((r) => r.wms && r.mes).length : 0;
                      const onlyWms = showMesColumn ? rows.filter((r) => r.wms && !r.mes).length : 0;
                      const onlyMes = showMesColumn ? rows.filter((r) => !r.wms && r.mes).length : 0;

                      const wmsCartonTotal = wo.totalQuantity;
                      const wmsPalletTotal = wo.totalPallets;
                      const mesCartonTotal = mesCheck?.records
                        ? mesCheck.records.reduce((sum, r) => sum + (r.LABEL_QTY || 0), 0)
                        : 0;
                      const mesPalletTotal = mesCheck?.records ? mesCheck.records.length : 0;

                      return (
                        <>
                          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 flex-wrap gap-2">
                            <div className="flex items-center gap-4 text-[10px] uppercase tracking-wide text-zinc-600">
                              <span>{labels.wms_inbound}</span>
                              {showMesColumn && (
                                <>
                                  <span className="text-emerald-400">{matched} {labels.matched}</span>
                                  {onlyWms > 0 && (
                                    <span className="text-amber-400">{onlyWms} {labels.only_in_wms}</span>
                                  )}
                                  {onlyMes > 0 && <span className="text-red-400">{onlyMes} {labels.only_in_mes}</span>}
                                </>
                              )}
                            </div>
                            <button
                              onClick={() => runMesCrossCheck(wo.workOrderNumber)}
                              disabled={mesCheck?.loading}
                              className="text-[11px] px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                            >
                              {mesCheck?.loading
                                ? "Checking MES..."
                                : showMesColumn
                                  ? labels.refresh_mes_check
                                  : labels.cross_check_mes}
                            </button>
                          </div>

                          <div className="flex items-center border-b border-zinc-800/60 text-[10px] uppercase tracking-wide text-zinc-600">
                            <div className="flex-1 flex items-center gap-4 px-4 py-2">
                              <span>
                               {labels.total_carton_wms}:{" "}
                                <span className="text-zinc-300 font-mono normal-case">
                                  {wmsCartonTotal.toLocaleString()}
                                </span>
                              </span>
                              <span>
                                 {labels.total_pallet_wms}:{" "}
                                <span className="text-zinc-300 font-mono normal-case">
                                  {wmsPalletTotal.toLocaleString()}
                                </span>
                              </span>
                            </div>
                            {showMesColumn && (
                              <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-l border-zinc-800">
                                <span>
                                  {labels.total_carton_mes}:{" "}
                                  <span className="text-zinc-300 font-mono normal-case">
                                    {mesCartonTotal.toLocaleString()}
                                  </span>
                                </span>
                                <span>
                                  {labels.total_pallet_mes}:{" "}
                                  <span className="text-zinc-300 font-mono normal-case">
                                    {mesPalletTotal.toLocaleString()}
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>

                          {mesCheck?.error && (
                            <p className="px-4 py-2 text-xs text-red-400">{mesCheck.error}</p>
                          )}


                          <div className="flex">
                            <table className="flex-1 text-xs">
                              <thead>
                                <tr className="text-zinc-500 text-left">
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">{labels.label}</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">SKU</th>
                                  <th className="px-4 py-2 font-medium text-right whitespace-nowrap">{labels.qty}</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">{labels.location}</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">{labels.status}</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap w-20">{labels.inbound_by}</th>
                                  <th className="px-4 py-2 font-medium text-right whitespace-nowrap">{labels.inbound}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => {
                                  const p = row.wms;
                                  return (
                                    <tr key={row.label} className="border-t border-zinc-800/60">
                                      <td className="px-4 py-2 font-mono text-zinc-400 whitespace-nowrap">
                                        {row.label}
                                      </td>
                                      {p ? (
                                        <>
                                          <td className="px-4 py-2 font-mono text-zinc-300 whitespace-nowrap">
                                            {p.itemSku}
                                          </td>
                                          <td className="px-4 py-2 text-right font-mono whitespace-nowrap">
                                            {p.quantity.toLocaleString()}
                                          </td>
                                          <td className="px-4 py-2 font-mono text-amber-500 whitespace-nowrap">
                                            {p.locationCode}
                                          </td>
                                          <td className="px-4 py-2 whitespace-nowrap">
                                            <span
                                              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                                p.status === "ACTIVE"
                                                  ? "bg-emerald-950 text-emerald-300"
                                                  : "bg-red-950 text-red-300"
                                              }`}
                                            >
                                              {p.status}
                                            </span>
                                          </td>
                                          <td
                                            className="px-4 py-2 text-zinc-400 truncate w-20"
                                            title={p.inboundByUsername ?? undefined}
                                          >
                                            {p.inboundByUsername ?? "—"}
                                          </td>
                                          <td className="px-4 py-2 text-right text-zinc-500 whitespace-nowrap">
                                            {new Date(p.inboundAt).toLocaleString()}
                                          </td>
                                        </>
                                      ) : (
                                        <>
                                          <td className="px-4 py-2 text-zinc-700 whitespace-nowrap">-</td>
                                          <td className="px-4 py-2 text-right text-zinc-700 whitespace-nowrap">-</td>
                                          <td className="px-4 py-2 text-zinc-700 whitespace-nowrap">-</td>
                                          <td className="px-4 py-2 text-zinc-700 whitespace-nowrap">-</td>
                                          <td className="px-4 py-2 text-zinc-700 w-20">-</td>
                                          <td className="px-4 py-2 text-right text-zinc-700 whitespace-nowrap">-</td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            {showMesColumn && (
                              <table className="shrink-0 text-xs border-l border-zinc-800">
                                <thead>
                                  <tr className="text-zinc-500 text-left">
                                    <th className="px-4 py-2 font-medium whitespace-nowrap">{labels.label_mes}</th>
                                    <th className="px-4 py-2 font-medium whitespace-nowrap">{labels.match}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => (
                                    <tr key={row.label} className="border-t border-zinc-800/60">
                                      <td className="px-4 py-2 font-mono text-zinc-400 whitespace-nowrap">
                                        {row.mes ? row.mes.LABEL_NO : "-"}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        {row.wms && row.mes ? (
                                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 whitespace-nowrap">
                                            {labels.match}
                                          </span>
                                        ) : row.mes ? (
                                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-950 text-red-300 whitespace-nowrap">
                                            {labels.missing_in_wms}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 whitespace-nowrap">
                                            {labels.missing_in_mes}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!isSearching && totalPages > 1 && (
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