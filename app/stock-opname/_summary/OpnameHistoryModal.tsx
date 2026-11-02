"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/LanguageContext";
import { columnNameFor } from "@/lib/columnNames";
import type { Bucket, Status, DetailEntry, DetailResponse } from "./types";
import { shownFigures, excludedFrom } from "./calc";
import { useDateLocale, formatDay } from "./format";
import { Delta } from "./Delta";

// One SOSKU session of one product (opened from its SOSKU number in the
// table), with System / SO / Δ per column, how the difference moved since
// that product's previous opname (which may be an earlier session the same
// day, or an earlier date), and its counted lines — expanded by default.
export function OpnameHistoryModal({
  itemId,
  date,
  opnameNumber,
  warehouseId,
  bucketKeys,
  labels,
  onClose,
}: {
  itemId: number;
  date: string;
  opnameNumber: string;
  warehouseId: number;
  bucketKeys: string[];
  labels: Record<string, string>;
  onClose: () => void;
}) {
  const locale = useDateLocale();
  const { language } = useLanguage();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Opnames whose counted lines the user has folded away; everything else
  // starts expanded.
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/stock-opname/summary/${itemId}?warehouseId=${warehouseId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? ""); // "" = the generic "failed to load" text
        setDetail(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : ""));
  }, [itemId, warehouseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The tab's columns, plus Total (always).
  const buckets = useMemo(() => {
    if (!detail) return [];
    const name = (b: Bucket) =>
      b.key === "other" ? labels.summary_other : b.key === "total" ? labels.summary_total : columnNameFor(b, language);
    return detail.buckets
      .filter((b) => b.key === "total" || bucketKeys.includes(b.key))
      .map((b) => ({ ...b, name: name(b) }));
  }, [detail, bucketKeys, labels, language]);
  // Same rule as the tab: unticked columns are taken off Total.
  const excludedKeys = useMemo(() => (detail ? excludedFrom(detail.buckets, bucketKeys) : []), [detail, bucketKeys]);
  const bucketName = (key: string) =>
    key === "outside"
      ? "—"
      : key === "other"
        ? labels.summary_other
        : (() => {
            const b = detail?.buckets.find((x) => x.key === key);
            return b ? columnNameFor(b, language) : key;
          })();

  // Full history newest first (for "change since previous"), and the
  // entries of the chosen date that the modal lists.
  const history = useMemo(() => (detail ? [...detail.entries].reverse() : []), [detail]);
  const entries = useMemo(
    () => history.filter((e) => e.date === date && e.opnameNumber === opnameNumber),
    [history, date, opnameNumber]
  );

  const statusLabel = (s: Status) =>
    s === "CONFIRMED" ? labels.status_confirmed : s === "DONE" ? labels.status_done : labels.status_in_progress;
  const colCount = 5 + buckets.length * 3;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-6xl max-h-[90vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {labels.detail_title}{" "}
              <span className="text-zinc-500 font-normal">
                · <span className="font-mono text-amber-500">{opnameNumber}</span> · {formatDay(date, locale).day}{" "}
                {formatDay(date, locale).weekday}
              </span>
            </h2>
            {detail && (
              <p className="text-sm text-zinc-500 mt-0.5">
                <span className="font-mono text-amber-500">{detail.item.sku}</span> {detail.item.name}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100">
            {labels.detail_close}
          </button>
        </div>

        <div className="overflow-auto p-5">
          {error !== null ? (
            <p className="text-sm text-red-400">{error || labels.summary_err_load}</p>
          ) : !detail ? (
            <p className="text-sm text-zinc-600">{labels.summary_loading}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-zinc-600">{labels.detail_none}</p>
          ) : (
            <table className="text-sm border-separate border-spacing-0 min-w-full">
              <thead>
                <tr className="text-zinc-500 text-left text-xs">
                  <th rowSpan={2} className="px-2 py-2 font-medium border-b border-zinc-800">{labels.detail_th_date}</th>
                  <th rowSpan={2} className="px-2 py-2 font-medium border-b border-zinc-800">{labels.detail_th_session}</th>
                  <th rowSpan={2} className="px-2 py-2 font-medium border-b border-zinc-800">{labels.detail_th_status}</th>
                  {buckets.map((b) => (
                    <th key={b.key} colSpan={3} className="px-2 py-2 font-medium text-center text-zinc-300 border-l border-b border-zinc-800">
                      {b.name}
                      {b.key === "total" && excludedKeys.length > 0 && <span className="text-amber-500">*</span>}
                    </th>
                  ))}
                  <th rowSpan={2} className="px-2 py-2 font-medium text-right border-l border-b border-zinc-800 whitespace-nowrap">
                    {labels.detail_th_change}
                  </th>
                  <th rowSpan={2} className="border-b border-zinc-800" />
                </tr>
                <tr className="text-zinc-500 text-xs">
                  {buckets.map((b) => (
                    <Fragment key={b.key}>
                      <th className="px-2 py-1.5 font-medium text-right border-l border-b border-zinc-800">{labels.summary_system}</th>
                      <th className="px-2 py-1.5 font-medium text-right border-b border-zinc-800">{labels.summary_so}</th>
                      <th className="px-2 py-1.5 font-medium text-right border-b border-zinc-800">{labels.summary_delta}</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const key = `${entry.opnameNumber}`;
                  const previous = history[history.indexOf(entry) + 1];
                  const totalDelta = (e: DetailEntry) => {
                    const t = shownFigures(e, "total", excludedKeys);
                    return t.counted - t.system;
                  };
                  const expanded = !open.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className="hover:bg-zinc-900/50">
                        <td className="px-2 py-2 font-mono text-xs text-zinc-400 border-t border-zinc-800/70 whitespace-nowrap">{entry.lockedAt}</td>
                        <td className="px-2 py-2 border-t border-zinc-800/70 whitespace-nowrap">
                          <span className="font-mono text-xs text-amber-500">{entry.opnameNumber}</span>
                          {entry.by && <span className="text-xs text-zinc-600"> · {entry.by}</span>}
                        </td>
                        <td className="px-2 py-2 text-xs border-t border-zinc-800/70 whitespace-nowrap">
                          <span className={entry.status === "IN_PROGRESS" ? "text-amber-400" : entry.status === "CONFIRMED" ? "text-sky-400" : "text-emerald-400"}>
                            {statusLabel(entry.status)}
                          </span>
                          {entry.adjustment && (
                            <span
                              className="ml-2 font-mono text-emerald-400"
                              title={`${entry.adjustment.at ?? ""}${entry.adjustment.by ? ` · ${entry.adjustment.by}` : ""}`}
                            >
                              ✓ {entry.adjustment.note}
                            </span>
                          )}
                        </td>
                        {buckets.map((b) => {
                          const f = shownFigures(entry, b.key, excludedKeys);
                          return (
                            <Fragment key={b.key}>
                              <td className="px-2 py-2 text-right font-mono text-zinc-400 border-t border-l border-zinc-800/70">{f.system.toLocaleString()}</td>
                              <td className="px-2 py-2 text-right font-mono text-zinc-100 border-t border-zinc-800/70">{f.counted.toLocaleString()}</td>
                              <td className="px-2 py-2 text-right font-mono border-t border-zinc-800/70">
                                <Delta value={f.counted - f.system} />
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className="px-2 py-2 text-right font-mono border-t border-l border-zinc-800/70">
                          {previous ? <Delta value={totalDelta(entry) - totalDelta(previous)} muted /> : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-2 py-2 border-t border-zinc-800/70 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                            aria-expanded={expanded}
                            className="text-xs text-zinc-500 hover:text-zinc-200"
                          >
                            {expanded ? "▼" : "▶"} {entry.lines.length}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={colCount} className="px-2 pb-3 pt-1 bg-zinc-900/30">
                            {entry.unaccounted !== 0 && (
                              <p className="text-xs text-amber-400 mb-2">
                                {labels.detail_unaccounted.replace("{n}", entry.unaccounted.toLocaleString())}
                              </p>
                            )}
                            {entry.lines.length === 0 ? (
                              <p className="text-xs text-zinc-600">{labels.detail_no_lines}</p>
                            ) : (
                              <table className="text-xs w-full">
                                <thead>
                                  <tr className="text-zinc-500 text-left">
                                    <th className="py-1.5 px-2 font-medium">{labels.detail_th_location}</th>
                                    <th className="py-1.5 px-2 font-medium">{labels.detail_th_column}</th>
                                    <th className="py-1.5 px-2 font-medium text-right">{labels.detail_th_system_at_count}</th>
                                    <th className="py-1.5 px-2 font-medium text-right">{labels.detail_th_counted}</th>
                                    <th className="py-1.5 px-2 font-medium text-right">{labels.summary_delta}</th>
                                    <th className="py-1.5 px-2 font-medium">{labels.detail_th_counted_at}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.lines.map((line) => (
                                    <tr key={line.locationCode} className="border-t border-zinc-800/60">
                                      <td className="py-1 px-2 font-mono text-amber-500">{line.locationCode}</td>
                                      <td className="py-1 px-2 text-zinc-400">{bucketName(line.bucket)}</td>
                                      <td className="py-1 px-2 text-right font-mono text-zinc-400">{line.systemQty.toLocaleString()}</td>
                                      <td className="py-1 px-2 text-right font-mono">{line.countedQty.toLocaleString()}</td>
                                      <td className="py-1 px-2 text-right font-mono">
                                        <Delta value={line.countedQty - line.systemQty} />
                                      </td>
                                      <td className="py-1 px-2 font-mono text-zinc-500 whitespace-nowrap">
                                        {line.countedAt ?? "—"}
                                        {line.countedBy ? ` · ${line.countedBy}` : ""}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
