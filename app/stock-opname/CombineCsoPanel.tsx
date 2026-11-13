"use client";

import { useMemo, useState, useEffect } from "react";
import { TabButton } from "./_sessions/badges";
import type { CombineResponse, CsoSummary, Selections } from "./_combine/types";
import { buildRows, readExcludedColumns, summarizeSkus, writeExcludedColumns } from "./_combine/calc";
import { LocationCheckTab } from "./_combine/LocationCheckTab";
import { SkuSummaryTab } from "./_combine/SkuSummaryTab";
import { exportCombineExcel } from "./_combine/exportCombineExcel";
import { fmtQty } from "./_summary/format";

type CsoSession = {
  opnameNumber: string;
  notes: string | null;
  completedAt: string | null;
  totalLines: number;
  countedLines: number;
};

// One CSO Summary's card, opened: pick the CSO sessions to combine and see
// them compared against the stock the summary locked when it was created.
export default function CombineCsoPanel({ summary, onBack }: { summary: CsoSummary; onBack: () => void }) {
  const [sessions, setSessions] = useState<CsoSession[]>([]);
  // Starts with the sessions last combined in this summary ticked.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(summary.opnameNumbers));
  const [loadingSessions, setLoadingSessions] = useState(true);
  // The CSO list starts minimized when this summary already has sessions
  // combined (reopening the card); open when nothing has been picked yet.
  const [pickerOpen, setPickerOpen] = useState(summary.opnameNumbers.length === 0);
  const [combining, setCombining] = useState(false);
  const [result, setResult] = useState<CombineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<"locations" | "skus">("locations");
  const [selections, setSelections] = useState<Selections>({});
  // Locations unticked on the SKU Summary, remembered in this browser.
  const [excludedColumns, setExcludedColumns] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readExcludedColumns()
  );

  useEffect(() => {
    openSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the CSO sessions; if this summary was combined before, show that
  // report straight away (sessions deleted since are left out).
  async function openSummary() {
    setLoadingSessions(true);
    const res = await fetch("/api/stock-opname/combine");
    const list: CsoSession[] = res.ok ? (await res.json()).sessions : [];
    setSessions(list);
    setLoadingSessions(false);

    const existing = new Set(list.map((s) => s.opnameNumber));
    const previous = summary.opnameNumbers.filter((n) => existing.has(n));
    setSelected(new Set(previous));
    if (previous.length > 0) await runCombine(previous);
    else setPickerOpen(true); // the saved sessions were all deleted: pick again
  }

  function toggle(opnameNumber: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opnameNumber)) next.delete(opnameNumber);
      else next.add(opnameNumber);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === sessions.length ? new Set() : new Set(sessions.map((s) => s.opnameNumber))));
  }

  async function fetchReport(opnameNumbers: string[]): Promise<CombineResponse | null> {
    const res = await fetch("/api/stock-opname/combine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opnameNumbers, summaryId: summary.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to combine");
      return null;
    }
    return res.json();
  }

  async function runCombine(opnameNumbers: string[]) {
    setCombining(true);
    setError(null);
    setResult(null);
    setSelections({});

    const report = await fetchReport(opnameNumbers);
    setCombining(false);
    if (report) {
      setResult(report);
      setReportTab("locations");
    }
  }

  async function handleCombine() {
    if (selected.size === 0) return;
    await runCombine(Array.from(selected));
  }

  // After a K3 import or removal: the same sessions again, keeping the picks.
  async function reloadReport() {
    if (!result) return;
    const report = await fetchReport(result.opnameNumbers);
    if (report) setResult(report);
  }

  function chooseSession(key: string, opnameNumber: string) {
    setSelections((prev) => ({ ...prev, [key]: opnameNumber }));
  }

  function toggleColumn(key: string) {
    setExcludedColumns((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      writeExcludedColumns(next);
      return next;
    });
  }

  const rows = useMemo(() => (result ? buildRows(result, selections) : []), [result, selections]);
  const skuRows = useMemo(
    () => (result ? summarizeSkus(result, rows, excludedColumns) : []),
    [result, rows, excludedColumns]
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border border-zinc-800 rounded-lg px-4 py-3 mb-4 bg-zinc-900/30">
        <div>
          <div className="text-sm font-medium text-zinc-100">{summary.name}</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            System stock locked {summary.createdAt}
            {summary.createdBy ? ` by ${summary.createdBy}` : ""} · {summary.skus.toLocaleString()} SKUs ·{" "}
            {summary.locations.toLocaleString()} locations · {fmtQty(summary.quantity)} ctn
            {summary.loosePacks > 0 ? ` + ${summary.loosePacks.toLocaleString()} pk` : ""}
          </div>
        </div>
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-800 transition-colors"
        >
          ← All summaries
        </button>
      </div>

      <p className="text-xs text-zinc-500 mb-4">
        Select the individual CSO stock opname sessions that together cover the warehouse (e.g.{" "}
        <span className="font-mono">CSO-Budi-01</span>, <span className="font-mono">CSO-Siti-02</span>), then
        combine them. Location Check compares each location&apos;s system SKU and quantity (as locked above) with
        what was counted there. SKU Summary totals every SKU by location against the locked stock, not just what
        was counted. If two sessions counted the same location and got the same result, it&apos;s counted once,
        not twice. If their results differ, the location is Under Review until you pick which session to use.
        Stock is never changed here.
      </p>

      <div className="border border-zinc-800 rounded-lg overflow-hidden mb-4">
        <div
          className={`px-4 py-2.5 flex items-center justify-between gap-3 ${pickerOpen ? "border-b border-zinc-800" : ""}`}
        >
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100"
            aria-expanded={pickerOpen}
          >
            <span className={`inline-block transition-transform ${pickerOpen ? "rotate-90" : ""}`}>▸</span>
            CSO Sessions
          </button>
          <div className="flex items-center gap-4">
            {pickerOpen && (
              <button onClick={toggleAll} className="text-xs text-amber-500 hover:text-amber-400">
                {selected.size === sessions.length && sessions.length > 0 ? "Deselect all" : "Select all"}
              </button>
            )}
            <span className="text-xs text-zinc-600">{selected.size} selected</span>
            {!pickerOpen && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-xs text-amber-500 hover:text-amber-400"
              >
                Change
              </button>
            )}
          </div>
        </div>
        {!pickerOpen ? (
          // Minimized: just the sessions ticked.
          selected.size > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {Array.from(selected)
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                .map((n) => (
                  <span key={n} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-500">
                    {n}
                  </span>
                ))}
            </div>
          )
        ) : loadingSessions ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">
            No CSO-prefixed sessions found. Create one from the Stock Opname tab with an opname number like{" "}
            <span className="font-mono">CSO-Budi-01</span>.
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-zinc-900">
            {sessions.map((s) => (
              <label
                key={s.opnameNumber}
                className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-900/50 cursor-pointer"
              >
                <input type="checkbox" checked={selected.has(s.opnameNumber)} onChange={() => toggle(s.opnameNumber)} />
                <span className="font-mono text-amber-500">{s.opnameNumber}</span>
                <span className="text-xs text-zinc-500">
                  {s.countedLines}/{s.totalLines} counted
                </span>
                {s.notes && <span className="text-xs text-zinc-600 truncate">{s.notes}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleCombine}
          disabled={selected.size === 0 || combining}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {combining ? "Combining..." : `Combine & Compare (${selected.size})`}
        </button>
        {result && (
          <button
            onClick={() => exportCombineExcel(result, rows, skuRows, excludedColumns, summary.name)}
            className="px-4 py-2 rounded-md border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            Export to Excel
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {result && (
        <div>
          <div className="flex border-b border-zinc-800 mb-5">
            <TabButton label="Location Check" active={reportTab === "locations"} onClick={() => setReportTab("locations")} />
            <TabButton label="SKU Summary" active={reportTab === "skus"} onClick={() => setReportTab("skus")} />
          </div>
          {reportTab === "locations" ? (
            <LocationCheckTab result={result} rows={rows} selections={selections} onChoose={chooseSession} />
          ) : (
            <SkuSummaryTab
              result={result}
              rows={skuRows}
              excludedColumns={excludedColumns}
              onToggleColumn={toggleColumn}
              onK3Changed={reloadReport}
            />
          )}
        </div>
      )}
    </div>
  );
}