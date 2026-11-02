"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/formatDateTime";
import SkuOpnameDetail, { type SkuDetailResponse } from "../SkuOpnameDetail";
import type { Session, ReportResponse } from "./types";
import { STATUS_STYLES, CurrentSystemCell, DifferenceBadge } from "./badges";
import { ConfirmModal } from "./ConfirmModal";

export function OpnameSessionRow({ session, labels }: { session: Session; labels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [skuDetail, setSkuDetail] = useState<SkuDetailResponse | null>(null);
  const isSku = session.isSkuSession;
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustResult, setAdjustResult] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  async function toggle() {
    if (!open && !(isSku ? skuDetail : report)) {
      await refetchReport();
    }
    setOpen((prev) => !prev);
  }

  async function refetchReport() {
    setLoading(true);
    if (isSku) {
      const res = await fetch(`/api/stock-opname/sku/${session.opnameNumber}`);
      if (res.ok) setSkuDetail(await res.json());
    } else {
      const res = await fetch(`/api/stock-opname/${session.opnameNumber}/report`);
      if (res.ok) setReport(await res.json());
    }
    setLoading(false);
  }

  async function handleAdjust() {
    setAdjusting(true);
    setAdjustError(null);
    setAdjustResult(null);

    const res = await fetch(`/api/stock-opname/${session.opnameNumber}/adjust`, {
      method: "POST",
    });
    setAdjusting(false);

    if (!res.ok) {
      const data = await res.json();
      setAdjustError(data.error ?? "Failed to adjust inventory");
      return;
    }

    const data = await res.json();
    setAdjustResult(
      `Applied ${data.applied} adjustment(s), ${data.skipped} already matched${
        data.failed > 0 ? `, ${data.failed} failed (see console)` : ""
      }.`
    );
    if (data.failed > 0) {
      console.warn("Stock opname adjust failures:", data.failures);
    }
    await refetchReport();
    router.refresh();
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-900/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-zinc-500 text-xs transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          <span className="font-mono text-amber-500 text-sm">{session.opnameNumber}</span>
          {session.assignedToUsername && (
            <span className="text-xs text-zinc-500">· PIC: {session.assignedToUsername}</span>
          )}
                    <span className="text-xs text-zinc-600" suppressHydrationWarning>
            · Commenced: {session.commencedAt ? formatDateTime(session.commencedAt) : "Not started"}
          </span>
          {session.completedAt && (
            <span className="text-xs text-zinc-600" suppressHydrationWarning>
              · Finished (PDA): {formatDateTime(session.completedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isSku ? (
            <span className="flex items-center gap-3 text-xs text-zinc-500">
              <span>{session.skuCount} SKU</span>
              <span>
                Locked qty: <span className="font-mono text-zinc-300">{session.skuLockedQty.toLocaleString()}</span>
              </span>
              <span>
                Stock opname qty:{" "}
                <span className="font-mono text-zinc-300">{session.skuCountedQty.toLocaleString()}</span>
              </span>
              <DifferenceBadge difference={session.skuCountedQty - session.skuLockedQty} />
            </span>
          ) : (
            <span className="text-xs text-zinc-500">
              {session.countedLines}/{session.totalLines} counted
            </span>
          )}
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLES[session.status]}`}
          >
            {session.status.replace("_", " ")}
          </span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* {(session.status === "DONE" || session.status === "CONFIRMED") && (
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={handleAdjust}
                disabled={adjusting}
                className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {adjusting ? "Adjusting..." : "Adjust"}
              </button>
              {adjustResult && <span className="text-xs text-emerald-400">{adjustResult}</span>}
              {adjustError && <span className="text-xs text-red-400">{adjustError}</span>}
            </div>
          )} */}

                    {session.status !== "CONFIRMED" && (
            <div className="mb-4">
              <button
                onClick={() => setConfirmModalOpen(true)}
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                Confirm
              </button>
            </div>
          )}

          {session.status === "CONFIRMED" && (
            <div className="mb-4 border border-blue-900 bg-blue-950/30 rounded-md px-3 py-2 text-xs text-blue-300 space-y-1">
              <div>Confirmed {session.confirmedAt ? formatDateTime(session.confirmedAt) : ""}</div>
              {session.confirmDescription && <div className="text-blue-200">{session.confirmDescription}</div>}
              {session.confirmedAdjustmentCode && (
                <div className="font-mono">Adjustment: {session.confirmedAdjustmentCode}</div>
              )}
            </div>
          )}

          {confirmModalOpen && (
            <ConfirmModal
              opnameNumber={session.opnameNumber}
              onClose={() => setConfirmModalOpen(false)}
              onConfirmed={() => {
                setConfirmModalOpen(false);
                refetchReport();
                router.refresh();
              }}
            />
          )}

          {loading ? (
            <p className="text-xs text-zinc-600">Loading...</p>
          ) : isSku ? (
            skuDetail ? (
              <SkuOpnameDetail
                detail={skuDetail}
                onDelete={
                  session.status === "CONFIRMED"
                    ? undefined
                    : async (sku) => {
                        const res = await fetch(
                          `/api/stock-opname/sku/${session.opnameNumber}/skus?itemId=${sku.itemId}`,
                          { method: "DELETE" }
                        );
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          return data.error ?? "Failed to delete the SKU";
                        }
                        await refetchReport();
                        router.refresh();
                        return null;
                      }
                }
              />
            ) : (
              <p className="text-xs text-red-400">Failed to load report</p>
            )
          ) : !report ? (
            <p className="text-xs text-red-400">Failed to load report</p>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="text-zinc-500 text-left border-t border-zinc-800">
                  <th className="py-2 px-3 font-medium">{labels.th_location}</th>
                  <th className="py-2 px-3 font-medium">{labels.th_counted_sku}</th>
                  <th className="py-2 px-3 font-medium">{labels.th_system_sku_at_count}</th>
                  <th className="py-2 px-3 font-medium">{labels.th_sku_match}</th>
                  <th className="py-2 px-3 font-medium text-right">{labels.th_counted_qty}</th>
                  <th className="py-2 px-3 font-medium text-right">{labels.th_system_qty_at_count}</th>
                  <th className="py-2 px-3 font-medium text-right">{labels.th_difference}</th>
                  <th className="py-2 px-3 font-medium">{labels.th_current_system_sku}</th>
                  <th className="py-2 px-3 font-medium text-right">{labels.th_current_system_qty}</th>
                  <th className="py-2 px-3 font-medium">{labels.th_by}</th>
                  <th className="py-2 px-3 font-medium">{labels.th_counted_at}</th>
                  <th className="py-2 px-3 font-medium"></th>
                </tr>
              </thead>
                            <tbody>
                {report.report.flatMap((loc) =>
                  loc.items.length === 0 ? (
                    <tr key={loc.locationCode} className="border-t border-zinc-800/60 hover:bg-zinc-900/50 transition-colors">
                      <td className="py-1.5 px-3 font-mono text-amber-500">{loc.locationCode}</td>
                      <td className="py-1.5 px-3 text-zinc-700">—</td>
                      <td className="py-1.5 px-3 text-zinc-700">—</td>
                      <td className="py-1.5 px-3 text-zinc-700">—</td>
                      <td className="py-1.5 px-3 text-right text-zinc-700">—</td>
                      <td className="py-1.5 px-3 text-right text-zinc-700">—</td>
                      <td className="py-1.5 px-3 text-right text-zinc-700">—</td>
                      <td className="py-1.5 px-3">
                        <CurrentSystemCell entries={loc.currentSystemStock} />
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-zinc-400">
                        {loc.currentSystemQty.toLocaleString()}
                      </td>
                     <td colSpan={3} className="py-1.5 px-3 text-zinc-700">
                        Not counted yet
                      </td>
                    </tr>
                  ) : (
                    loc.items.map((item, i) => (
                      <tr key={`${loc.locationCode}-${i}`} className="border-t border-zinc-800/60 hover:bg-zinc-900/50 transition-colors">
                        <td className="py-1.5 px-3 font-mono text-amber-500">{loc.locationCode}</td>
                        <td className="py-1.5 px-3">
                          {item.itemSku ? (
                            <>
                              <span className="font-mono text-zinc-300">{item.itemSku}</span>{" "}
                              <span className="text-zinc-500">{item.itemName}</span>
                            </>
                          ) : (
                            <span className="text-zinc-500 italic">{item.itemName}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-zinc-400">{item.systemSku}</td>
                        <td className="py-1.5 px-3">
                          {item.skuMatch === "MATCH" ? (
                            <span className="text-emerald-400">Match</span>
                          ) : (
                            <span className="text-red-400">Mismatch</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono">
                          {item.countedQty.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono text-zinc-400">
                          {item.systemQty.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <DifferenceBadge difference={item.difference} />
                        </td>
                        <td className="py-1.5 px-3">
                          {item.itemId !== null ? (
                            item.currentItemQty && item.currentItemQty > 0 ? (
                              <div>
                                <span className="font-mono text-zinc-300">{item.itemSku}</span>{" "}
                                <span className="text-zinc-500">{item.itemName}</span>
                              </div>
                            ) : (
                              <span className="text-zinc-700">—</span>
                            )
                          ) : (
                            <CurrentSystemCell entries={loc.currentSystemStock} />
                          )}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono text-zinc-400">
                          {item.itemId !== null
                            ? (item.currentItemQty ?? 0).toLocaleString()
                            : loc.currentSystemQty.toLocaleString()}
                        </td>
                        <td className="py-1.5 px-3 text-zinc-500">{item.countedByUsername ?? "—"}</td>
                        <td className="py-1.5 px-3 text-zinc-500">
                          {formatDateTime(item.countedAt)}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {item.itemId === null ? (
                            item.difference === 0 ? (
                              <span className="text-[10px] text-zinc-700">Matched</span>
                            ) : (
                              <span className="text-[10px] text-zinc-600">Manual review</span>
                            )
                          ) : (
                            <span className="text-[10px] text-zinc-600">Manual review</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
