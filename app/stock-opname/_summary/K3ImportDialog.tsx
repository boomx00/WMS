"use client";

import { useEffect, useRef, useState } from "react";
import type { Status, K3Import, SummaryResponse, DateSession } from "./types";
import { formatDay, fmtQty } from "./format";
import { readK3File } from "./k3File";

// Import K3 for one date: several PICs opname on the same day and each pulls
// their own Real-time Inventory export from K3, so the file is imported for
// the SOSKU sessions ticked here. Lists every session of the date with the K3
// data it has (file, when, by whom), which can be removed per session.
export function K3ImportDialog({
  date,
  data,
  sessions,
  labels,
  locale,
  onImported,
  onClose,
}: {
  date: string;
  data: SummaryResponse;
  sessions: DateSession[];
  labels: Record<string, string>;
  locale: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(() => (sessions.length === 1 ? [sessions[0].opnameNumber] : []));
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null); // "import" or the session being cleared
  const [notice, setNotice] = useState<
    { kind: "ok"; result: K3Import } | { kind: "error"; message: string } | null
  >(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const { day, weekday } = formatDay(date, locale);
  const importOf = (opnameNumber: string): K3Import | null => {
    const id = data.k3Sessions?.[opnameNumber];
    return id === undefined ? null : data.k3Imports?.[id] ?? null;
  };
  const statusLabel = (st: Status) =>
    st === "CONFIRMED" ? labels.status_confirmed : st === "DONE" ? labels.status_done : labels.status_in_progress;
  const toggle = (n: string) => setChosen((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]));
  const replacing = chosen.filter((n) => importOf(n)).length;

  async function runImport() {
    if (!file || chosen.length === 0) return;
    setBusy("import");
    setNotice(null);
    try {
      const rows = await readK3File(file, labels);
      const res = await fetch("/api/stock-opname/summary/k3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: data.warehouse.id, date, fileName: file.name, opnameNumbers: chosen, rows }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `${labels.k3_err_import} (${res.status})`);
      setNotice({ kind: "ok", result: json.import as K3Import });
      setChosen([]);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onImported();
    } catch (err) {
      setNotice({ kind: "error", message: err instanceof Error ? err.message : labels.k3_err_import });
    } finally {
      setBusy(null);
    }
  }

  async function remove(opnameNumber: string) {
    if (!window.confirm(labels.k3_remove_confirm.replace("{sosku}", opnameNumber))) return;
    setBusy(opnameNumber);
    setNotice(null);
    try {
      const res = await fetch(`/api/stock-opname/summary/k3?opnameNumber=${encodeURIComponent(opnameNumber)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `${labels.k3_err_remove} (${res.status})`);
      onImported();
    } catch (err) {
      setNotice({ kind: "error", message: err instanceof Error ? err.message : labels.k3_err_remove });
    } finally {
      setBusy(null);
    }
  }

  const th = "px-2 py-1.5 font-medium text-left border-b border-zinc-800 bg-zinc-900 break-keep";
  const td = "px-2 py-1.5 border-t border-zinc-800/70 align-top";
  const linkBtn = "text-xs text-zinc-400 hover:text-zinc-100 underline-offset-2 hover:underline disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {labels.k3_dialog_title}{" "}
              <span className="text-zinc-400 font-normal">
                · {day} {weekday} · {data.warehouse.name}
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-2xl">{labels.k3_dialog_intro}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          >
            {labels.detail_close}
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0">
              <tr className="text-zinc-400">
                <th className={`${th} w-8`} />
                <th className={th}>{labels.summary_th_sosku}</th>
                <th className={th}>{labels.k3_dialog_th_pic}</th>
                <th className={`${th} text-right`}>{labels.k3_dialog_th_skus}</th>
                <th className={th}>{labels.k3_dialog_th_locked}</th>
                <th className={th}>{labels.k3_dialog_th_data}</th>
                <th className={`${th} w-8`} />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const imp = importOf(s.opnameNumber);
                const others = imp ? imp.sessions.filter((n) => n !== s.opnameNumber) : [];
                const checked = chosen.includes(s.opnameNumber);
                return (
                  <tr
                    key={s.opnameNumber}
                    className={`cursor-pointer ${checked ? "bg-amber-500/10" : "hover:bg-zinc-900/60"}`}
                    onClick={() => !busy && toggle(s.opnameNumber)}
                  >
                    <td className={td}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!!busy}
                        onChange={() => toggle(s.opnameNumber)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={s.opnameNumber}
                        className="accent-amber-500"
                      />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="font-mono text-amber-500">{s.opnameNumber}</div>
                      <div
                        className={`text-[10px] ${
                          s.status === "IN_PROGRESS" ? "text-amber-400" : s.status === "CONFIRMED" ? "text-sky-400" : "text-emerald-400"
                        }`}
                      >
                        {statusLabel(s.status)}
                      </div>
                    </td>
                    <td className={`${td} text-zinc-300`}>{s.by ?? "—"}</td>
                    <td className={`${td} text-right tabular-nums text-zinc-300`}>{s.skus.toLocaleString()}</td>
                    <td className={`${td} font-mono text-zinc-500 whitespace-nowrap`}>
                      {s.firstAt === s.lastAt ? s.firstAt : `${s.firstAt} – ${s.lastAt.slice(11)}`}
                    </td>
                    <td className={td}>
                      {imp ? (
                        <div className="text-sky-300">
                          <div className="break-all">{imp.fileName ?? "—"}</div>
                          <div className="text-[10px] text-zinc-500">
                            {imp.importedAt}
                            {imp.by ? ` · ${imp.by}` : ""} ·{" "}
                            {labels.k3_dialog_matched
                              .replace("{skus}", imp.matchedSkus.toLocaleString())
                              .replace("{qty}", fmtQty(imp.totalQuantity))}
                          </div>
                          {others.length > 0 && (
                            <div className="text-[10px] text-zinc-500">
                              {labels.k3_dialog_shared.replace("{list}", others.join(", "))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-600">{labels.k3_dialog_none}</span>
                      )}
                    </td>
                    <td className={td}>
                      {imp && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(s.opnameNumber);
                          }}
                          disabled={!!busy}
                          title={labels.k3_remove}
                          aria-label={`${labels.k3_remove} ${s.opnameNumber}`}
                          className="px-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          {busy === s.opnameNumber ? "…" : "✕"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={linkBtn} disabled={!!busy} onClick={() => setChosen(sessions.map((s) => s.opnameNumber))}>
              {labels.k3_dialog_select_all}
            </button>
            <button
              type="button"
              className={linkBtn}
              disabled={!!busy}
              onClick={() => setChosen(sessions.filter((s) => !importOf(s.opnameNumber)).map((s) => s.opnameNumber))}
            >
              {labels.k3_dialog_select_missing}
            </button>
            <button type="button" className={linkBtn} disabled={!!busy} onClick={() => setChosen([])}>
              {labels.k3_dialog_clear}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-zinc-400">{labels.k3_dialog_file}</label>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!!busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-zinc-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 hover:file:bg-zinc-800"
            />
            <button
              type="button"
              onClick={runImport}
              disabled={!!busy || chosen.length === 0 || !file}
              title={chosen.length === 0 ? labels.k3_dialog_pick_session : !file ? labels.k3_dialog_pick_file : undefined}
              className="ml-auto px-3 py-1.5 rounded-md bg-sky-600 text-sm text-white hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600"
            >
              {busy === "import"
                ? labels.k3_button_busy
                : labels.k3_dialog_import_button.replace("{n}", String(chosen.length))}
            </button>
          </div>
          {replacing > 0 && !busy && (
            <p className="text-xs text-amber-400">{labels.k3_replace_confirm.replace("{n}", String(replacing))}</p>
          )}
          {notice && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                notice.kind === "ok" ? "border-sky-900 bg-sky-950/30 text-sky-200" : "border-red-900 bg-red-950/30 text-red-300"
              }`}
            >
              {notice.kind === "error" ? (
                labels.k3_error.replace("{date}", day).replace("{message}", notice.message)
              ) : (
                <>
                  {labels.k3_import_done
                    .replace("{sessions}", notice.result.sessions.join(", "))
                    .replace("{warehouse}", notice.result.k3Warehouse ?? "")
                    .replace("{skus}", notice.result.matchedSkus.toLocaleString())
                    .replace("{qty}", fmtQty(notice.result.totalQuantity))}
                  {notice.result.unmatched.length > 0 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-amber-400 hover:text-amber-200">
                        {labels.k3_unmatched.replace("{n}", notice.result.unmatched.length.toLocaleString())} ·{" "}
                        {labels.k3_show_unmatched}
                      </summary>
                      <table className="mt-1 text-[10px]">
                        <tbody>
                          {notice.result.unmatched.map((u) => (
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
