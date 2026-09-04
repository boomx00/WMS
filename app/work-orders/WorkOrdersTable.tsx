"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RefreshButton from "@/components/RefreshButton";

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
  return label.trim().toUpperCase();
}

// Union of every label seen on either side, so a label that only exists in
// MES (or only in WMS) still gets its own row — with "-" standing in for
// whichever side doesn't have it.
function buildCrossCheckRows(pallets: Pallet[], mesRecords: MesRecord[]): CrossCheckRow[] {
  const wmsByLabel = new Map(pallets.map((p) => [normalizeLabelForMatch(p.label), p]));
  const mesByLabel = new Map(mesRecords.map((r) => [normalizeLabelForMatch(r.LABEL_NO), r]));
  const allKeys = new Set([...wmsByLabel.keys(), ...mesByLabel.keys()]);

  return Array.from(allKeys)
    .sort()
    .map((key) => {
      const wms = wmsByLabel.get(key) ?? null;
      const mes = mesByLabel.get(key) ?? null;
      return { label: wms?.label ?? mes?.LABEL_NO ?? key, wms, mes };
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
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all work orders by number or SKU..."
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
        <RefreshButton onClick={handleRefresh} loading={searching} />
      </div>

      <p className="text-xs text-zinc-600 mb-3">
        {searching
          ? "Searching..."
          : isSearching
            ? `${displayed.length.toLocaleString()} result(s) for "${search.trim()}"`
            : `Page ${page} of ${totalPages} · ${totalCount.toLocaleString()} work orders total`}
      </p>

      <div className="space-y-3 mb-4">
        {displayed.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-12 text-center text-zinc-600 text-sm">
            {isSearching ? "No matching work orders." : "No work orders yet."}
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
                      {wo.totalPallets.toLocaleString()} pallet(s) ·{" "}
                      <span className="text-zinc-300 font-mono">{wo.totalQuantity.toLocaleString()}</span>{" "}
                      total units
                    </div>
                    <div className="text-zinc-600 text-[10px]">
                      Originally inbounded: {wo.totalOriginalInbound.toLocaleString()}
                    </div>
                    <div className="text-zinc-600 text-[10px]">
                      First inbound:{" "}
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
                        : wo.pallets.map((p) => ({ label: p.label, wms: p, mes: null }));
                      const showMesColumn = !!mesCheck?.records;

                      const matched = showMesColumn ? rows.filter((r) => r.wms && r.mes).length : 0;
                      const onlyWms = showMesColumn ? rows.filter((r) => r.wms && !r.mes).length : 0;
                      const onlyMes = showMesColumn ? rows.filter((r) => !r.wms && r.mes).length : 0;

                      return (
                        <>
                          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 flex-wrap gap-2">
                            <div className="flex items-center gap-4 text-[10px] uppercase tracking-wide text-zinc-600">
                              <span>WMS Inbound</span>
                              {showMesColumn && (
                                <>
                                  <span className="text-emerald-400">{matched} matched</span>
                                  {onlyWms > 0 && (
                                    <span className="text-amber-400">{onlyWms} only in WMS</span>
                                  )}
                                  {onlyMes > 0 && <span className="text-red-400">{onlyMes} only in MES</span>}
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
                                  ? "Refresh MES Check"
                                  : "Cross Check MES"}
                            </button>
                          </div>

                          {mesCheck?.error && (
                            <p className="px-4 py-2 text-xs text-red-400">{mesCheck.error}</p>
                          )}

                          <div className="flex">
                            <table className="flex-1 text-xs">
                              <thead>
                                <tr className="text-zinc-500 text-left">
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">Label</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">SKU</th>
                                  <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Qty</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">Location</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                                  <th className="px-4 py-2 font-medium whitespace-nowrap">Inbound By</th>
                                  <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Inbound</th>
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
                                          <td className="px-4 py-2 text-zinc-400 whitespace-nowrap">
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
                                          <td className="px-4 py-2 text-zinc-700 whitespace-nowrap">-</td>
                                          <td className="px-4 py-2 text-right text-zinc-700 whitespace-nowrap">-</td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            {showMesColumn && (
                              <table className="w-72 text-xs border-l border-zinc-800">
                                <thead>
                                  <tr className="text-zinc-500 text-left">
                                    <th className="px-4 py-2 font-medium whitespace-nowrap">Label (MES)</th>
                                    <th className="px-4 py-2 font-medium whitespace-nowrap">Match</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => (
                                    <tr key={row.label} className="border-t border-zinc-800/60">
                                      <td
                                        className="px-4 py-2 font-mono text-zinc-400 truncate max-w-[140px]"
                                        title={row.mes ? row.mes.LABEL_NO : undefined}
                                      >
                                        {row.mes ? row.mes.LABEL_NO : "-"}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap">
                                        {row.wms && row.mes ? (
                                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 whitespace-nowrap">
                                            Match
                                          </span>
                                        ) : row.mes ? (
                                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-950 text-red-300 whitespace-nowrap">
                                            Missing in WMS
                                          </span>
                                        ) : (
                                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 whitespace-nowrap">
                                            Missing in MES
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