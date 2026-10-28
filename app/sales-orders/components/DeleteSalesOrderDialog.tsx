"use client";

import { useEffect, useState } from "react";

type PlanLine = {
  itemId: number;
  sku: string;
  name: string;
  kind: "staged" | "shipped";
  fromLocationCode: string | null;
  quantity: number;
  short: number;
};

type Plan = { soNumber: string; finished: boolean; floor: string; lines: PlanLine[] };

// Manager only: shows what deleting the SO puts back on FLOOR (stock still
// in staging for it, and what already shipped), then deletes it.
export default function DeleteSalesOrderDialog({
  soNumber,
  labels,
  onDeleted,
  onClose,
}: {
  soNumber: string;
  labels: Record<string, string>;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sales-orders/${encodeURIComponent(soNumber)}/delete`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? labels.delete_failed);
        if (!cancelled) setPlan(json as Plan);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : labels.delete_failed);
      });
    return () => {
      cancelled = true;
    };
  }, [soNumber, labels.delete_failed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !deleting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, deleting]);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${encodeURIComponent(soNumber)}/delete`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? labels.delete_failed);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.delete_failed);
      setDeleting(false);
    }
  }

  const floor = plan?.floor ?? "FLOOR";
  const total = plan?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0;
  const th = "py-2 px-2 font-medium";
  const td = "py-1.5 px-2 border-t border-zinc-800/60";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold">
            {labels.delete_title} <span className="font-mono text-amber-500">{soNumber}</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">{labels.delete_intro.replace("{floor}", floor)}</p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {!plan && !error && <p className="text-sm text-zinc-500">{labels.delete_loading}</p>}
          {plan && plan.lines.length === 0 && <p className="text-sm text-zinc-400">{labels.delete_nothing}</p>}
          {plan && plan.lines.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-left">
                  <th className={th}>{labels.th_sku}</th>
                  <th className={th}>{labels.delete_th_from}</th>
                  <th className={th}>{labels.delete_th_to}</th>
                  <th className={`${th} text-right`}>{labels.qty}</th>
                </tr>
              </thead>
              <tbody>
                {plan.lines.map((l, i) => (
                  <tr key={i}>
                    <td className={td}>
                      <div className="font-mono text-zinc-300">{l.sku}</div>
                      <div className="text-zinc-500">{l.name}</div>
                    </td>
                    <td className={td}>
                      {l.kind === "staged" ? (
                        <>
                          <span className="font-mono text-amber-500">{l.fromLocationCode}</span>{" "}
                          <span className="text-zinc-500">({labels.delete_staged})</span>
                        </>
                      ) : (
                        <span className="text-sky-300">{labels.delete_shipped}</span>
                      )}
                      {l.short > 0 && (
                        <div className="text-[10px] text-amber-400">
                          {labels.delete_short.replace("{n}", l.short.toLocaleString())}
                        </div>
                      )}
                    </td>
                    <td className={`${td} font-mono text-amber-500`}>{floor}</td>
                    <td className={`${td} text-right font-mono`}>{l.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-zinc-200">
                  <td className={`${td} border-zinc-700`} colSpan={3}>
                    {labels.delete_total.replace("{floor}", floor)}
                  </td>
                  <td className={`${td} border-zinc-700 text-right font-mono`}>{total.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={!plan || deleting}
            className="px-3 py-1.5 rounded-md bg-red-600 text-sm text-white hover:bg-red-500 disabled:opacity-40"
          >
            {deleting ? labels.deleting : labels.delete_confirm.replace("{so}", soNumber)}
          </button>
        </div>
      </div>
    </div>
  );
}
