"use client";

import { useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { getStockOpnameCycleRange, type StockOpnameCycle, type StockOpnameCycleType } from "@/lib/stockOpnameCycle";
import { OPNAME_CYCLE_SETTINGS_LABELS } from "@/lib/stockOpnamePlanLabels";

const WEEKDAYS = [
  "opname_cycle_monday",
  "opname_cycle_tuesday",
  "opname_cycle_wednesday",
  "opname_cycle_thursday",
  "opname_cycle_friday",
  "opname_cycle_saturday",
  "opname_cycle_sunday",
];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const todayInJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

// Stock Opname cycle: how long a SKU stays "already opnamed" for the Stock
// Opname Plan, weekly or monthly, from a chosen start day.
export default function OpnameCycleSetting({ initial, readOnly }: { initial: StockOpnameCycle; readOnly: boolean }) {
  const labels = usePageLabels("settings_page", OPNAME_CYCLE_SETTINGS_LABELS);
  const [saved, setSaved] = useState(initial);
  const [type, setType] = useState(initial.type);
  const [startDay, setStartDay] = useState(initial.startDay);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = type !== saved.type || startDay !== saved.startDay;
  const range = getStockOpnameCycleRange(todayInJakarta(), { type, startDay });

  function changeType(next: StockOpnameCycleType) {
    setType(next);
    setStartDay(next === saved.type ? saved.startDay : 1);
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opnameCycleType: type, opnameCycleStartDay: startDay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? labels.opname_cycle_save_failed);
      setSaved({ type, startDay });
      setMessage({ kind: "ok", text: labels.opname_cycle_saved });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : labels.opname_cycle_save_failed });
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    "px-2 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 disabled:opacity-60";

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <div className="text-sm font-medium">{labels.opname_cycle}</div>
      <p className="text-xs text-zinc-500 mt-1 max-w-sm">{labels.opname_cycle_description}</p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <select
          value={type}
          onChange={(e) => changeType(e.target.value as StockOpnameCycleType)}
          disabled={readOnly}
          aria-label={labels.opname_cycle_type}
          className={fieldClass}
        >
          <option value="WEEKLY">{labels.opname_cycle_weekly}</option>
          <option value="MONTHLY">{labels.opname_cycle_monthly}</option>
        </select>
        <label className="text-xs text-zinc-500" htmlFor="opname-cycle-start">
          {labels.opname_cycle_starts_on}
        </label>
        <select
          id="opname-cycle-start"
          value={startDay}
          onChange={(e) => {
            setStartDay(Number(e.target.value));
            setMessage(null);
          }}
          disabled={readOnly}
          className={fieldClass}
        >
          {type === "WEEKLY"
            ? WEEKDAYS.map((key, i) => (
                <option key={key} value={i + 1}>
                  {labels[key]}
                </option>
              ))
            : MONTH_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
        </select>
        {!readOnly && (
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-3 py-1.5 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "Saving…" : labels.save}
          </button>
        )}
        {message && (
          <span className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {message.text}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-500 mt-3">
        {labels.opname_cycle_current.replace("{from}", range.from).replace("{to}", range.to)}
      </p>
      {type === "MONTHLY" && startDay > 28 && (
        <p className="text-xs text-zinc-500 mt-1">{labels.opname_cycle_short_month}</p>
      )}
    </div>
  );
}
