"use client";

import { useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { SETTINGS_WAREHOUSE_LABELS } from "@/lib/warehouseLabels";

type Option = { id: number; code: string };
type Key = "defaultReceivingLocationId" | "defaultStagingLocationId";

// One warehouse's PDA-picker defaults, and its receiving / staging
// locations to choose them from.
export type WarehouseDefaults = {
  id: number;
  name: string;
  isActive: boolean;
  defaultReceivingLocationId: number | null;
  defaultStagingLocationId: number | null;
  receiving: Option[];
  staging: Option[];
};

// Settings → Locations & Marking: which location the PDA's pickers start on,
// per warehouse — the receiving picker (Inbound, Move Floor → Rack) and the
// staging picker (Picking, Shipping, Outbound contents). Workers can still
// choose another one on the PDA when there's more than one.
export default function DefaultLocationsSetting({
  warehouses,
  readOnly,
}: {
  warehouses: WarehouseDefaults[];
  readOnly: boolean;
}) {
  const labels = usePageLabels("settings_page", SETTINGS_WAREHOUSE_LABELS);

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <div className="text-sm font-medium">{labels.default_locations}</div>
      <p className="text-xs text-zinc-500 mt-1 max-w-sm">{labels.default_locations_description}</p>

      <div className="mt-4 space-y-5">
        {warehouses.map((warehouse) => (
          <WarehouseDefaultsRows key={warehouse.id} warehouse={warehouse} readOnly={readOnly} />
        ))}
      </div>
    </div>
  );
}

function WarehouseDefaultsRows({ warehouse, readOnly }: { warehouse: WarehouseDefaults; readOnly: boolean }) {
  const labels = usePageLabels("settings_page", SETTINGS_WAREHOUSE_LABELS);
  const [values, setValues] = useState<Record<Key, number | null>>({
    defaultReceivingLocationId: warehouse.defaultReceivingLocationId,
    defaultStagingLocationId: warehouse.defaultStagingLocationId,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(key: Key, value: number | null) {
    const previous = values[key];
    setValues((v) => ({ ...v, [key]: value }));
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/warehouses/${warehouse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMessage({ kind: "ok", text: "Saved" });
    } catch (err) {
      setValues((v) => ({ ...v, [key]: previous }));
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  const rows: { key: Key; label: string; list: Option[] }[] = [
    { key: "defaultReceivingLocationId", label: labels.default_receiving, list: warehouse.receiving },
    { key: "defaultStagingLocationId", label: labels.default_staging, list: warehouse.staging },
  ];

  return (
    <div>
      <div className="text-xs font-medium text-zinc-300 mb-2">
        {warehouse.name}
        {!warehouse.isActive && <span className="ml-1.5 text-zinc-500 font-normal">{labels.warehouse_inactive_suffix}</span>}
      </div>
      <div className="space-y-3 pl-3 border-l border-zinc-800">
        {rows.map(({ key, label, list }) => {
          const value = values[key];
          // A saved default that's no longer receiving/staging still shows,
          // so it can be changed.
          const missing = value !== null && !list.some((o) => o.id === value);
          return (
            <div key={key} className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-zinc-400 w-48">{label}</label>
              <select
                value={value ?? ""}
                onChange={(e) => save(key, e.target.value ? Number(e.target.value) : null)}
                disabled={readOnly || saving}
                aria-label={`${warehouse.name} ${label}`}
                className="px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 font-mono focus:outline-none focus:border-amber-500 disabled:opacity-60 min-w-48"
              >
                <option value="">{labels.default_none}</option>
                {missing && <option value={value!}>#{value}</option>}
                {list.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code}
                  </option>
                ))}
              </select>
              {list.length === 0 && <span className="text-xs text-amber-500">{labels.default_no_locations}</span>}
            </div>
          );
        })}
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

// Settings → Locations & Marking: order marking on/off. On = picked stock
// in a staging location is reserved for the SO / Tambahan it was picked
// for. Off = staging stock is one shared pool any order can ship from.
export function MarkingSetting({ initialEnabled, readOnly }: { initialEnabled: boolean; readOnly: boolean }) {
  const labels = usePageLabels("settings_page", SETTINGS_WAREHOUSE_LABELS);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markingEnabled: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setEnabled(!next);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
    }
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{labels.marking}</div>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm">
            {enabled ? labels.marking_on_description : labels.marking_off_description}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving || readOnly}
          aria-label={labels.marking}
          aria-pressed={enabled}
          className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
            enabled ? "bg-amber-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {error && <p className="text-xs mt-3 text-red-400">{error}</p>}
    </div>
  );
}
