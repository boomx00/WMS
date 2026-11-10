"use client";

import { useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { useLanguage } from "@/lib/LanguageContext";
import { unitName, type UnitInfo } from "@/lib/uom";

// English text for this setting until its keys are added to
// lib/pageLabels.ts (settings_page); then they're editable on Settings →
// Translations like the rest.
export const LOCATION_STOCK_UNITS_SETTINGS_LABELS: Record<string, string> = {
  location_stock_units: "Location Stock totals",
  location_stock_units_description:
    "Which units of measure the Location Stock cards (Total, Floor, Rack) add up in. Each product counts in every ticked unit it has — e.g. Pack counts cartons × packs per carton plus loose packs; Pallet uses each product's cartons per pallet. Units come from Items → Units.",
  location_stock_units_automatic: "Automatic — each product's primary unit",
  location_stock_units_automatic_hint: "Nothing ticked: Carton products total in Carton, Kilogram products in Kilogram, and so on.",
  location_stock_units_saved: "Saved.",
  location_stock_units_save_failed: "Failed to save",
  location_stock_units_none: "No units yet — add them on Items → Units.",
  save: "Save",
};

type Unit = Pick<UnitInfo, "id" | "code" | "name" | "nameId" | "nameZh">;

// Settings: which units the Location Stock cards total in, in the order
// ticked. None ticked = automatic.
export default function LocationStockUnitsSetting({
  units,
  initialIds,
  readOnly,
}: {
  units: Unit[];
  initialIds: number[];
  readOnly: boolean;
}) {
  const labels = usePageLabels("settings_page", LOCATION_STOCK_UNITS_SETTINGS_LABELS);
  const { language } = useLanguage();
  const [saved, setSaved] = useState(initialIds);
  const [selected, setSelected] = useState(initialIds);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = selected.join(",") !== saved.join(",");

  function toggle(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationStockTotalUnitIds: selected.length ? selected : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? labels.location_stock_units_save_failed);
      setSaved(selected);
      setMessage({ kind: "ok", text: labels.location_stock_units_saved });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : labels.location_stock_units_save_failed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <div className="text-sm font-medium">{labels.location_stock_units}</div>
      <p className="text-xs text-zinc-500 mt-1 max-w-md">{labels.location_stock_units_description}</p>

      {units.length === 0 ? (
        <p className="text-xs text-zinc-500 mt-4">{labels.location_stock_units_none}</p>
      ) : (
        <div className="flex flex-wrap gap-2 mt-4">
          {units.map((u) => {
            const on = selected.includes(u.id);
            const order = selected.indexOf(u.id) + 1;
            return (
              <label
                key={u.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm select-none ${
                  on ? "border-amber-600 bg-amber-500/10 text-zinc-100" : "border-zinc-700 text-zinc-400"
                } ${readOnly ? "opacity-60" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={readOnly}
                  onChange={() => toggle(u.id)}
                  className="accent-amber-500"
                />
                {unitName(u, language)} <span className="font-mono text-[11px] text-zinc-500">{u.code}</span>
                {on && selected.length > 1 && <span className="text-[10px] text-amber-500">#{order}</span>}
              </label>
            );
          })}
        </div>
      )}

      <p className="text-xs text-zinc-500 mt-3">
        {selected.length === 0 ? (
          <>
            <span className="text-zinc-300">{labels.location_stock_units_automatic}.</span>{" "}
            {labels.location_stock_units_automatic_hint}
          </>
        ) : (
          selected
            .map((id) => units.find((u) => u.id === id))
            .filter((u): u is Unit => !!u)
            .map((u) => unitName(u, language))
            .join(" · ")
        )}
      </p>

      {!readOnly && (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-3 py-1.5 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "Saving…" : labels.save}
          </button>
          {message && (
            <span className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {message.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
