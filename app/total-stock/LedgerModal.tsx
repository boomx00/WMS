"use client";

import { useEffect, useState } from "react";
import { downloadXlsxMultiSheet } from "./exportLedgerXlsx";

type BucketKey = "good" | "export" | "defect";

type BucketEntry = {
  id: number;
  type: string;
  quantity: number;
  direction: "IN" | "OUT";
  otherLocationCode: string | null;
  soNumber: string | null;
  tambahanNumber: string | null;
  workOrderNumber: string | null;
  username: string;
  createdAt: string;
  delta: number;
  runningTotal: number;
};

type BucketData = {
  openingBalance: number;
  closingBalance: number;
  entries: BucketEntry[];
};

type LedgerResponse = {
  sku: string;
  name: string;
  anchorOpeningAt: string;
  truncated: boolean;
  rangeFrom: string;
  rangeTo: string | null;
  buckets: Record<BucketKey, BucketData>;
  total: { openingBalance: number; closingBalance: number };
};

type Query = { sku: string; from: string; to: string };

const BUCKET_LABELS: Record<BucketKey, string> = {
  good: "Good Stock Ledger",
  export: "Export Ledger",
  defect: "Defect Ledger",
};

const INBOUND_TYPES = new Set(["INBOUND", "DEFAULT_INBOUND"]);

type DisplayRow =
  | { kind: "single"; entry: BucketEntry }
  | {
      kind: "group";
      key: string;
      type: string;
      workOrderNumber: string;
      entries: BucketEntry[];
      totalDelta: number;
      lastCreatedAt: string;
      runningTotal: number;
    };

function groupEntries(entries: BucketEntry[], bucketKey: BucketKey): DisplayRow[] {
  const rows: DisplayRow[] = [];

  for (const entry of entries) {
    const groupable = INBOUND_TYPES.has(entry.type) && entry.workOrderNumber;
    const last = rows[rows.length - 1];

    if (
      groupable &&
      last?.kind === "group" &&
      last.type === entry.type &&
      last.workOrderNumber === entry.workOrderNumber
    ) {
      last.entries.push(entry);
      last.totalDelta += entry.delta;
      last.lastCreatedAt = entry.createdAt;
      last.runningTotal = entry.runningTotal;
      continue;
    }

    if (groupable) {
      rows.push({
        kind: "group",
        key: `${bucketKey}-group-${entry.id}`,
        type: entry.type,
        workOrderNumber: entry.workOrderNumber!,
        entries: [entry],
        totalDelta: entry.delta,
        lastCreatedAt: entry.createdAt,
        runningTotal: entry.runningTotal,
      });
    } else {
      rows.push({ kind: "single", entry });
    }
  }

  return rows.map((row) =>
    row.kind === "group" && row.entries.length === 1 ? { kind: "single", entry: row.entries[0] } : row
  );
}

function describeEvent(entry: BucketEntry): string {
  if (entry.soNumber) return `SO ${entry.soNumber}`;
  if (entry.tambahanNumber) return `Tambahan ${entry.tambahanNumber}`;
  if (entry.workOrderNumber) return `MO ${entry.workOrderNumber}`;
  if (entry.direction === "IN") return entry.otherLocationCode ? `from ${entry.otherLocationCode}` : "in";
  return entry.otherLocationCode ? `to ${entry.otherLocationCode}` : "out";
}

function BucketSection({
  bucketKey,
  data,
  expandedGroups,
  onToggleGroup,
}: {
  bucketKey: BucketKey;
  data: BucketData;
  expandedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
}) {
  const rows = groupEntries(data.entries, bucketKey);

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-zinc-200 mb-2">{BUCKET_LABELS[bucketKey]}</h3>
      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              <th className="px-3 py-2 font-medium w-6"></th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium">By</th>
              <th className="px-3 py-2 font-medium text-right">Δ</th>
              <th className="px-3 py-2 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-zinc-800 bg-zinc-900/40">
              <td className="px-3 py-2 font-mono text-xs text-zinc-500" colSpan={5}>
                Opening balance
              </td>
              <td className="px-3 py-2 text-right text-zinc-600">—</td>
              <td className="px-3 py-2 text-right font-mono">{data.openingBalance.toLocaleString()}</td>
            </tr>

            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-zinc-600">
                  No movement in this range.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                if (row.kind === "single") {
                  const entry = row.entry;
                  return (
                    <tr key={entry.id} className="border-t border-zinc-800/70">
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500">{entry.createdAt}</td>
                      <td className="px-3 py-2 text-zinc-300">{entry.type}</td>
                      <td className="px-3 py-2 text-zinc-400">{describeEvent(entry)}</td>
                      <td className="px-3 py-2 text-zinc-400">{entry.username}</td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          entry.delta > 0 ? "text-emerald-400" : entry.delta < 0 ? "text-red-400" : "text-zinc-600"
                        }`}
                      >
                        {entry.delta > 0 ? "+" : ""}
                        {entry.delta.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{entry.runningTotal.toLocaleString()}</td>
                    </tr>
                  );
                }

                const expanded = expandedGroups.has(row.key);

                return (
                  <>
                    <tr
                      key={row.key}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expanded}
                      onClick={() => onToggleGroup(row.key)}
                      className="border-t border-zinc-800/70 hover:bg-zinc-900/50 cursor-pointer"
                    >
                      <td className="px-3 py-2">
                        <span
                          className={`text-zinc-500 text-[10px] inline-block transition-transform ${
                            expanded ? "rotate-90" : ""
                          }`}
                        >
                          ▶
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500">{row.lastCreatedAt}</td>
                      <td className="px-3 py-2 text-zinc-300">{row.type}</td>
                      <td className="px-3 py-2 text-zinc-400">
                        MO {row.workOrderNumber} <span className="text-zinc-600">× {row.entries.length}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{row.entries[0].username}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">
                        +{row.totalDelta.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{row.runningTotal.toLocaleString()}</td>
                    </tr>

                    {expanded &&
                      row.entries.map((entry) => (
                        <tr key={entry.id} className="border-t border-zinc-800/40 bg-zinc-950/60">
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2 pl-6 font-mono text-xs text-zinc-500">{entry.createdAt}</td>
                          <td className="px-3 py-2 text-zinc-400 text-xs">{entry.type}</td>
                          <td className="px-3 py-2 text-zinc-500 text-xs">MO {entry.workOrderNumber}</td>
                          <td className="px-3 py-2 text-zinc-500 text-xs">{entry.username}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-emerald-400/80">
                            +{entry.delta.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-zinc-400">
                            {entry.runningTotal.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </>
                );
              })
            )}

            <tr className="border-t border-zinc-800 bg-zinc-900/40">
              <td className="px-3 py-2 font-mono text-xs text-zinc-500" colSpan={5}>
                Closing balance
              </td>
              <td className="px-3 py-2 text-right text-zinc-600">—</td>
              <td className="px-3 py-2 text-right font-mono">{data.closingBalance.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LedgerModal({ sku, onClose }: { sku: string; onClose: () => void }) {
  const [skuInput, setSkuInput] = useState(sku);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [query, setQuery] = useState<Query>({ sku, from: "", to: "" });

  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const trimmedSku = query.sku.trim();
    if (!trimmedSku) {
      setData(null);
      setError("Enter a SKU");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    const qs = params.toString();

    fetch(`/api/total-stock/${encodeURIComponent(trimmedSku)}/ledger${qs ? `?${qs}` : ""}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load ledger");
        return res.json();
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setExpandedGroups(new Set());
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Failed to load ledger");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  function applyFilters() {
    setQuery({ sku: skuInput, from: fromInput, to: toInput });
  }

  function clearDates() {
    setFromInput("");
    setToInput("");
    setQuery((prev) => ({ ...prev, from: "", to: "" }));
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportXlsx() {
    if (!data) return;

    const sheets = (Object.keys(data.buckets) as BucketKey[]).map((key) => {
      const bucket = data.buckets[key];
      const rows: (string | number)[][] = [
        ["Opening balance", "", "", "", "", bucket.openingBalance],
        ...bucket.entries.map((e) => [e.createdAt, e.type, describeEvent(e), e.username, e.delta, e.runningTotal]),
        ["Closing balance", "", "", "", "", bucket.closingBalance],
      ];
      return { name: BUCKET_LABELS[key], headers: ["When", "Type", "Detail", "By", "Delta", "Balance"], rows };
    });

    sheets.push({
      name: "Total Stock",
      headers: ["", "Opening", "Closing"],
      rows: [["Total Stock", data.total.openingBalance, data.total.closingBalance]],
    });

    downloadXlsxMultiSheet(`${data.sku}-ledger.xlsx`, sheets);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-lg w-[90vw] h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">{data ? `${data.sku} — ${data.name}` : skuInput}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Good Stock, Export, and Defect ledgers for this SKU — each starts from its own opening balance, not full history.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-4 flex flex-wrap items-end gap-3 shrink-0">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">SKU</label>
            <input
              type="text"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500 w-36"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">From</label>
            <input
              type="date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">To</label>
            <input
              type="date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={applyFilters}
            className="px-4 py-1.5 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 transition-colors"
          >
            Apply
          </button>

          {(query.from || query.to) && (
            <button
              onClick={clearDates}
              className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors"
            >
              Clear dates
            </button>
          )}

          <button
            onClick={exportXlsx}
            disabled={!data}
            className="ml-auto px-4 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-40 transition-colors"
          >
            Export to Excel
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading && <p className="text-sm text-zinc-500">Loading...</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}

          {data && !loading && (
            <>
              <div className="mb-4 text-sm text-zinc-400 space-y-1">
                <div>
                  Showing <span className="font-mono">{data.rangeFrom}</span>
                  {data.rangeTo && (
                    <>
                      {" "}
                      through <span className="font-mono">{data.rangeTo}</span>
                    </>
                  )}
                </div>
                {data.truncated && (
                  <div className="text-amber-500">
                    Ledger only goes back to {data.anchorOpeningAt} — showing from there instead.
                  </div>
                )}
              </div>

              <BucketSection
                bucketKey="good"
                data={data.buckets.good}
                expandedGroups={expandedGroups}
                onToggleGroup={toggleGroup}
              />
              <BucketSection
                bucketKey="export"
                data={data.buckets.export}
                expandedGroups={expandedGroups}
                onToggleGroup={toggleGroup}
              />
              <BucketSection
                bucketKey="defect"
                data={data.buckets.defect}
                expandedGroups={expandedGroups}
                onToggleGroup={toggleGroup}
              />
            </>
          )}
        </div>

        {data && (
          <div className="px-5 py-3 border-t border-zinc-800 shrink-0 flex items-center justify-between bg-zinc-900/60">
            <span className="text-sm text-zinc-400">Total Stock</span>
            <span className="font-mono text-sm">
              <span className="text-zinc-500">{data.total.openingBalance.toLocaleString()}</span>
              <span className="text-zinc-600 mx-2">→</span>
              <span className="text-zinc-100 font-semibold">{data.total.closingBalance.toLocaleString()}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}