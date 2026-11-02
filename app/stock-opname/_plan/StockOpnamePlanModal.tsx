"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SHIFT_3_MIN_SKUS,
  DEFAULT_SHIFT_3_MIN_STOCK,
  type PlannedSku,
  type SkippedSku,
  type SkipReason,
  type StockOpnamePlan,
  type WarehouseShift,
} from "@/lib/stockOpnamePlan";
import { readProductionPlan, readShippingPlan } from "./planFiles";

type PlanResponse = {
  warehouse: { id: number; name: string };
  warehouses: { id: number; name: string; isActive: boolean }[];
  plan: StockOpnamePlan;
};

const SHIFTS: { key: WarehouseShift; name: string; hours: string }[] = [
  { key: "08-16", name: "plan_shift_a", hours: "plan_shift_a_hours" },
  { key: "16-24", name: "plan_shift_b", hours: "plan_shift_b_hours" },
  { key: "24-08", name: "plan_shift_c", hours: "plan_shift_c_hours" },
];

const SKIP_REASONS: { key: SkipReason; label: string }[] = [
  { key: "IN_PRODUCTION", label: "plan_skip_in_production" },
  { key: "COUNTED_THIS_WEEK", label: "plan_skip_counted" },
  { key: "ON_OTHER_ORDERS", label: "plan_skip_other_orders" },
];

const todayInJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

function SkuRow({ row, labels }: { row: PlannedSku; labels: Record<string, string> }) {
  return (
    <li className="px-3 py-2 border-t border-zinc-800/70">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-zinc-100">{row.sku}</span>
        <span className="text-xs tabular-nums text-zinc-200">{row.stockQty.toLocaleString()}</span>
      </div>
      {row.name && <div className="text-xs text-zinc-500 mt-0.5">{row.name}</div>}
      {row.docNos.length > 0 && (
        <div className="text-[11px] font-mono text-zinc-500 mt-0.5 break-all">{row.docNos.join(", ")}</div>
      )}
      {row.availableShifts.length === 1 && (
        <div className="text-[11px] text-amber-400 mt-0.5">{labels.plan_only_free_shift}</div>
      )}
    </li>
  );
}

function SkippedGroup({ title, rows }: { title: string; rows: SkippedSku[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-medium text-zinc-300 mb-1">
        {title} ({rows.length})
      </h4>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.sku} className="text-xs text-zinc-500">
            <span className="font-mono text-zinc-300">{row.sku}</span>
            {row.name && <> · {row.name}</>}
            {row.docNos.length > 0 && <span className="font-mono"> · {row.docNos.join(", ")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Which SKUs to count in each warehouse shift, from the two uploaded plans and
// the WMS's Good Stock (POST /api/stock-opname/plan). Nothing is saved.
export function StockOpnamePlanModal({ labels, onClose }: { labels: Record<string, string>; onClose: () => void }) {
  const [date, setDate] = useState(todayInJakarta);
  const [productionFile, setProductionFile] = useState<File | null>(null);
  const [shippingFile, setShippingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [noProductionFor, setNoProductionFor] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function generate(warehouseId: number | null) {
    if (!productionFile || !shippingFile) {
      setError(labels.plan_err_no_files);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [productionPlan, shippingPlan] = await Promise.all([
        readProductionPlan(productionFile, labels),
        readShippingPlan(shippingFile, labels),
      ]);
      const res = await fetch("/api/stock-opname/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId, date, productionPlan, shippingPlan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `${labels.plan_err_generate} (${res.status})`);
      setResult(json as PlanResponse);
      setNoProductionFor(productionPlan.some((r) => r.date === date) ? null : date);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : labels.plan_err_generate);
    } finally {
      setBusy(false);
    }
  }

  const plan = result?.plan;
  const total = plan ? SHIFTS.reduce((n, s) => n + plan.sessions[s.key].length, 0) : 0;
  const highStockInC = plan ? plan.sessions["24-08"].filter((r) => r.stockQty >= DEFAULT_SHIFT_3_MIN_STOCK).length : 0;
  const fileInput =
    "w-full text-xs text-zinc-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-zinc-700 file:bg-zinc-900 file:text-zinc-200 hover:file:bg-zinc-800";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-6xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {labels.plan_title}
              {result && <span className="text-zinc-400 font-normal"> · {result.warehouse.name}</span>}
            </h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-3xl">{labels.plan_intro}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          >
            {labels.plan_close}
          </button>
        </div>

        <div className="overflow-y-auto">
          <div className="px-5 py-3 border-b border-zinc-800 grid gap-3 md:grid-cols-[auto_1fr_1fr_auto] md:items-end">
            <div>
              <label htmlFor="plan-date" className="block text-xs text-zinc-500 mb-1">
                {labels.plan_date}
              </label>
              <input
                id="plan-date"
                type="date"
                value={date}
                disabled={busy}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label htmlFor="plan-production" className="block text-xs text-zinc-500 mb-1">
                {labels.plan_production_file}
              </label>
              <input
                id="plan-production"
                type="file"
                accept=".xlsx,.xls"
                disabled={busy}
                onChange={(e) => setProductionFile(e.target.files?.[0] ?? null)}
                className={fileInput}
              />
            </div>
            <div>
              <label htmlFor="plan-shipping" className="block text-xs text-zinc-500 mb-1">
                {labels.plan_shipping_file}
              </label>
              <input
                id="plan-shipping"
                type="file"
                accept=".xlsx,.xls"
                disabled={busy}
                onChange={(e) => setShippingFile(e.target.files?.[0] ?? null)}
                className={fileInput}
              />
            </div>
            <button
              type="button"
              onClick={() => generate(result?.warehouse.id ?? null)}
              disabled={busy || !date || !productionFile || !shippingFile}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {busy ? labels.plan_generating : labels.plan_generate}
            </button>
          </div>

          {error && (
            <div className="mx-5 mt-3 rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {result && plan && (
            <div className="px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-300">
                  {labels.plan_summary.replace("{n}", String(total)).replace("{skipped}", String(plan.skipped.length))}
                </p>
                {result.warehouses.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-zinc-500">
                    {labels.plan_warehouse}
                    <select
                      value={result.warehouse.id}
                      disabled={busy}
                      onChange={(e) => generate(Number(e.target.value))}
                      className="px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-200"
                    >
                      {result.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {noProductionFor && (
                <p className="rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                  {labels.plan_warn_no_production.replace("{date}", noProductionFor)}
                </p>
              )}
              {highStockInC < DEFAULT_SHIFT_3_MIN_SKUS && (
                <p className="rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
                  {labels.plan_warn_shift_c
                    .replace("{n}", String(highStockInC))
                    .replace("{stock}", DEFAULT_SHIFT_3_MIN_STOCK.toLocaleString())
                    .replace("{target}", String(DEFAULT_SHIFT_3_MIN_SKUS))}
                </p>
              )}

              <div className="grid gap-3 md:grid-cols-3 md:items-start">
                {SHIFTS.map((shift) => {
                  const rows = plan.sessions[shift.key];
                  return (
                    <section key={shift.key} className="border border-zinc-800 rounded-lg bg-zinc-900/30 overflow-hidden">
                      <header className="px-3 py-2 flex items-baseline justify-between gap-2 bg-zinc-900">
                        <h3 className="text-sm font-semibold">
                          {labels[shift.name]} <span className="text-xs font-normal text-zinc-500">{labels[shift.hours]}</span>
                        </h3>
                        <span className="text-xs text-zinc-400">
                          {labels.plan_sku_count.replace("{n}", String(rows.length))}
                        </span>
                      </header>
                      <div className="px-3 py-1 flex justify-between text-[11px] text-zinc-500">
                        <span>{labels.plan_th_sku}</span>
                        <span>{labels.plan_th_stock}</span>
                      </div>
                      {rows.length === 0 ? (
                        <p className="px-3 py-4 border-t border-zinc-800/70 text-xs text-zinc-600">{labels.plan_empty_shift}</p>
                      ) : (
                        <ul>
                          {rows.map((row) => (
                            <SkuRow key={row.sku} row={row} labels={labels} />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>

              {plan.skipped.length > 0 && (
                <details className="border border-zinc-800 rounded-lg px-3 py-2">
                  <summary className="cursor-pointer text-sm text-zinc-300">
                    {labels.plan_skipped} ({plan.skipped.length})
                  </summary>
                  <div className="mt-3 space-y-3">
                    {SKIP_REASONS.map((reason) => (
                      <SkippedGroup
                        key={reason.key}
                        title={labels[reason.label]}
                        rows={plan.skipped.filter((row) => row.reason === reason.key)}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
