"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { SO_IMPORT_LABELS } from "@/lib/salesOrderImportLabels";
import type { ImportDocResult, ImportResponse } from "@/lib/salesOrderImport";

// Sales Orders → Import from Excel. Choosing a file runs a preview (nothing
// saved) showing the date read from row 1 and which documents will import
// or fail; "Import N documents" then saves them and shows the final result.

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ImportSalesOrdersPanel() {
  const router = useRouter();
  const labels = usePageLabels("sales_page", SO_IMPORT_LABELS);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function reset() {
    setFile(null);
    setData(null);
    setError(null);
    setExpanded(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  async function send(f: File, commit: boolean) {
    setError(null);
    setLoading(commit ? "commit" : "preview");
    const form = new FormData();
    form.append("file", f);
    form.append("commit", commit ? "1" : "0");
    try {
      const res = await fetch("/api/sales-orders/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Import failed");
        setData(null);
        return;
      }
      setData(body as ImportResponse);
      setExpanded(new Set());
      if (commit) router.refresh();
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setLoading(null);
    }
  }

  function onFileChosen(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setData(null);
    send(f, false);
  }

  function reasonText(r: ImportDocResult): string {
    const template = labels[`import_reason_${r.reason}`] ?? r.reason ?? "";
    return template.replace("{detail}", r.detail ?? "");
  }

  function toggle(row: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
      >
        ⇪ {labels.import_button}
      </button>
    );
  }

  const ok = data?.results.filter((r) => r.ok) ?? [];
  const failed = data?.results.filter((r) => !r.ok) ?? [];
  const committed = data?.committed ?? false;

  const renderTable = (rows: ImportDocResult[], showReason: boolean) => (
    <div className="border border-zinc-800 rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-zinc-900 text-zinc-500 text-left">
            <th className="px-3 py-2 font-medium w-6"></th>
            <th className="px-3 py-2 font-medium">{labels.import_th_doc}</th>
            <th className="px-3 py-2 font-medium">{labels.import_th_type}</th>
            <th className="px-3 py-2 font-medium text-right">{labels.import_th_lines}</th>
            <th className="px-3 py-2 font-medium text-right">{labels.import_th_qty}</th>
            {showReason && <th className="px-3 py-2 font-medium">{labels.import_th_reason}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = expanded.has(r.row);
            return (
              <Fragment key={r.row}>
                <tr
                  className={`border-t border-zinc-800 ${r.lines.length > 0 ? "cursor-pointer hover:bg-zinc-900/50" : ""}`}
                  onClick={() => r.lines.length > 0 && toggle(r.row)}
                >
                  <td className="px-3 py-1.5 text-zinc-600">
                    {r.lines.length > 0 && (
                      <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-amber-500">{r.soNumber || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-zinc-400">{r.typeName ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{r.lines.length}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
                    {r.totalQty.toLocaleString()}
                  </td>
                  {showReason && <td className="px-3 py-1.5 text-red-400">{reasonText(r)}</td>}
                </tr>
                {isOpen &&
                  r.lines.map((l, i) => (
                    <tr key={i} className="bg-zinc-950/40">
                      <td></td>
                      <td className="px-3 py-1 font-mono text-zinc-400">{l.sku}</td>
                      <td colSpan={2} className="px-3 py-1 text-zinc-500">
                        {l.name}
                      </td>
                      <td className="px-3 py-1 text-right font-mono text-zinc-400">
                        {l.quantity.toLocaleString()}
                      </td>
                      {showReason && <td></td>}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">{labels.import_title}</h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl">{labels.import_hint}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {labels.import_close}
        </button>
      </div>

      {!committed && (
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => onFileChosen(e.target.files?.[0])}
            disabled={loading !== null}
            className="text-xs text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 file:text-xs hover:file:bg-zinc-800"
          />
          {loading === "preview" && <span className="text-xs text-zinc-500">{labels.import_reading}</span>}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="text-xs">
              <span className="text-zinc-500">{labels.import_order_date}: </span>
              <span className="text-zinc-200 font-mono">{formatDate(data.orderDate)}</span>
              {data.dateText && <span className="text-zinc-600"> ({data.dateText})</span>}
            </p>
            <p className={`text-sm font-medium ${committed ? "text-emerald-400" : "text-zinc-200"}`}>
              {(committed ? labels.import_result_summary : labels.import_preview_summary)
                .replace("{ok}", String(ok.length))
                .replace("{failed}", String(failed.length))}
            </p>
          </div>

          {failed.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-red-400 mb-2">
                {labels.import_failed} ({failed.length})
              </h3>
              {renderTable(failed, true)}
            </div>
          )}

          {ok.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-emerald-400 mb-2">
                {committed ? labels.import_imported : labels.import_ready} ({ok.length})
              </h3>
              {renderTable(ok, false)}
            </div>
          )}

          <div className="flex items-center gap-3">
            {!committed ? (
              <>
                {ok.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => file && send(file, true)}
                    disabled={loading !== null || !file}
                    className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
                  >
                    {loading === "commit"
                      ? labels.import_importing
                      : labels.import_confirm.replace("{n}", String(ok.length))}
                  </button>
                ) : (
                  <p className="text-xs text-amber-400">{labels.import_nothing_to_import}</p>
                )}
                <button
                  type="button"
                  onClick={reset}
                  disabled={loading !== null}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                >
                  {labels.import_cancel}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
              >
                {labels.import_another}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
