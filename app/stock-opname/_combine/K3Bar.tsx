"use client";

import { useRef, useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { STOCK_OPNAME_SUMMARY_LABELS } from "@/lib/stockOpnameSummaryLabels";
import { readK3File } from "../_summary/k3File";
import { fmtQty, todayLocal } from "../_summary/format";
import type { K3Info } from "./types";

// Import K3 on the SKU Summary tab. Same file and same endpoint as the Stock
// Opname Summary's Import K3, but the combined report has one total per SKU,
// so one file goes with all the sessions in the report.
export function K3Bar({
  opnameNumbers,
  k3,
  onChanged,
}: {
  opnameNumbers: string[];
  k3: K3Info | null;
  onChanged: () => void;
}) {
  const labels = usePageLabels("stock_opname", STOCK_OPNAME_SUMMARY_LABELS);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notCovered = k3 ? opnameNumbers.filter((n) => !k3.sessions.includes(n)) : [];

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await readK3File(file, labels);
      const res = await fetch("/api/stock-opname/summary/k3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayLocal(), fileName: file.name, opnameNumbers, rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `${labels.k3_err_import} (${res.status})`);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.k3_err_import);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove the K3 data of the sessions in this report?")) return;
    setBusy(true);
    setError(null);
    try {
      for (const opnameNumber of opnameNumbers) {
        const res = await fetch(`/api/stock-opname/summary/k3?opnameNumber=${encodeURIComponent(opnameNumber)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`${labels.k3_err_remove} (${res.status})`);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.k3_err_remove);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-lg px-4 py-3 mb-5 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-zinc-400">{labels.k3_dialog_file}</span>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-zinc-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 hover:file:bg-zinc-800"
        />
        <button
          type="button"
          onClick={runImport}
          disabled={busy || !file}
          title={!file ? labels.k3_dialog_pick_file : undefined}
          className="px-3 py-1.5 rounded-md bg-sky-600 text-sm text-white hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600"
        >
          {busy ? labels.k3_button_busy : labels.k3_import}
        </button>
      </div>

      {k3 && (
        <div className="text-xs text-sky-300">
          <span className="break-all">{k3.fileName ?? "—"}</span>
          <span className="text-zinc-500">
            {" "}
            · {k3.importedAt}
            {k3.by ? ` · ${k3.by}` : ""} ·{" "}
            {labels.k3_dialog_matched.replace("{skus}", k3.matchedSkus.toLocaleString()).replace("{qty}", fmtQty(k3.totalQuantity))}
          </span>{" "}
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-zinc-400 hover:text-red-400 underline-offset-2 hover:underline disabled:opacity-40"
          >
            Remove
          </button>
          {file && !busy && <p className="mt-1 text-amber-400">Importing this file replaces the K3 data above.</p>}
          {notCovered.length > 0 && (
            <p className="mt-1 text-amber-400">
              Imported for {k3.sessions.join(", ")} only, not {notCovered.join(", ")}. Import again to use one file for all of them.
            </p>
          )}
          {k3.unmatched.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-amber-400 hover:text-amber-200">
                {labels.k3_unmatched.replace("{n}", k3.unmatched.length.toLocaleString())} · {labels.k3_show_unmatched}
              </summary>
              <table className="mt-1 text-[10px]">
                <tbody>
                  {k3.unmatched.map((u) => (
                    <tr key={u.code}>
                      <td className="pr-3 font-mono text-amber-400">{u.code}</td>
                      <td className="pr-3 text-zinc-400">{u.name ?? ""}</td>
                      <td className="text-right tabular-nums text-zinc-300">{fmtQty(u.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
