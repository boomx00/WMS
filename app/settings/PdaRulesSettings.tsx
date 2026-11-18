"use client";

import { useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";

// Settings → PDA (lib/pdaRules.ts): quantity units on picking / shipping,
// strict-mode maximums per activity, and what a product code is matched
// against. English defaults here; translations via Settings → Translations
// (page "settings_page").
export const PDA_RULES_LABELS: Record<string, string> = {
  pda_rules: "PDA",
  pda_lookup: "Product code accepts",
  pda_lookup_description:
    "What a code scanned or typed into the PDA's product field is matched against. A pallet label is matched by its SKU segment, so it needs SKU or Legacy SKU.",
  pda_lookup_sku: "SKU",
  pda_lookup_legacy: "Legacy SKU",
  pda_lookup_barcode: "Carton barcode (incl. extra barcodes)",
  pda_units: "Quantity units",
  pda_units_description:
    "Which units the PDA offers for typing a quantity. Names come from each product's category (Items → Categories). A product without a storage unit always gets its primary unit.",
  pda_units_picking: "Picking",
  pda_units_shipping: "Shipping",
  pda_unit_storage: "Storage unit (e.g. Pallet)",
  pda_unit_primary: "Primary unit (e.g. Carton)",
  pda_strict: "Strict mode",
  pda_strict_description:
    "While on, one pick or one ship can move at most the amounts below, so a whole order can't be scanned in one go. Off = no maximum.",
  pda_max_pick: "Max per pick",
  pda_max_ship: "Max per ship",
  pda_max_none: "No maximum",
  pda_basis_storage: "storage units (e.g. pallets)",
  pda_basis_primary: "primary units (e.g. cartons)",
  pda_basis_note:
    "A maximum in storage units is converted per product (1 pallet = that product's cartons per pallet); it doesn't apply to products without a storage unit.",
  pda_save: "Save",
  pda_saved: "Saved",
  pda_save_failed: "Couldn't save",
  pda_need_one: "Tick at least one",
};

type Level = "STORAGE" | "PRIMARY";
type Field = "SKU" | "LEGACY_SKU" | "BARCODE";
type Limit = { qty: number; basis: Level } | null;

export type PdaRulesInitial = {
  pickUnits: Level[];
  shipUnits: Level[];
  strictMode: boolean;
  maxPick: Limit;
  maxShip: Limit;
  itemLookupFields: Field[];
};

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value);
}

export default function PdaRulesSettings({ initial, readOnly }: { initial: PdaRulesInitial; readOnly: boolean }) {
  const labels = usePageLabels("settings_page", PDA_RULES_LABELS);
  const [lookup, setLookup] = useState<Field[]>(initial.itemLookupFields);
  const [pickUnits, setPickUnits] = useState<Level[]>(initial.pickUnits);
  const [shipUnits, setShipUnits] = useState<Level[]>(initial.shipUnits);
  const [strict, setStrict] = useState(initial.strictMode);
  const [maxPick, setMaxPick] = useState(initial.maxPick ? String(initial.maxPick.qty) : "");
  const [maxPickBasis, setMaxPickBasis] = useState<Level>(initial.maxPick?.basis ?? "STORAGE");
  const [maxShip, setMaxShip] = useState(initial.maxShip ? String(initial.maxShip.qty) : "");
  const [maxShipBasis, setMaxShipBasis] = useState<Level>(initial.maxShip?.basis ?? "STORAGE");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const invalid = lookup.length === 0 || pickUnits.length === 0 || shipUnits.length === 0;

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemLookupFields: lookup,
          pdaPickUnits: pickUnits,
          pdaShipUnits: shipUnits,
          pdaStrictMode: strict,
          pdaMaxPickQty: maxPick.trim() === "" ? null : Number(maxPick),
          pdaMaxPickBasis: maxPickBasis,
          pdaMaxShipQty: maxShip.trim() === "" ? null : Number(maxShip),
          pdaMaxShipBasis: maxShipBasis,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? labels.pda_save_failed);
      setMessage({ kind: "ok", text: labels.pda_saved });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : labels.pda_save_failed });
    } finally {
      setSaving(false);
    }
  }

  const card = "border border-zinc-800 rounded-lg p-5 bg-zinc-900/30";
  const fieldClass =
    "px-2 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 disabled:opacity-60";

  // Render helpers, called as functions (not <Components/>) so the inputs
  // keep focus while typing.
  function check(checked: boolean, onChange: (on: boolean) => void, label: string) {
    return (
      <label key={label} className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={checked}
          disabled={readOnly}
          onChange={(e) => {
            onChange(e.target.checked);
            setMessage(null);
          }}
          className="accent-amber-500"
        />
        {label}
      </label>
    );
  }

  function unitChecks(value: Level[], onChange: (next: Level[]) => void) {
    return (
      <div className="space-y-1.5">
        {check(value.includes("STORAGE"), (on) => onChange(toggle(value, "STORAGE", on)), labels.pda_unit_storage)}
        {check(value.includes("PRIMARY"), (on) => onChange(toggle(value, "PRIMARY", on)), labels.pda_unit_primary)}
        {value.length === 0 && <p className="text-xs text-red-400">{labels.pda_need_one}</p>}
      </div>
    );
  }

  function maxRow(label: string, qty: string, setQty: (v: string) => void, basis: Level, setBasis: (v: Level) => void) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-300 w-28">{label}</span>
        <input
          type="number"
          min={1}
          step={1}
          value={qty}
          placeholder={labels.pda_max_none}
          disabled={readOnly || !strict}
          onChange={(e) => {
            setQty(e.target.value.replace(/[^0-9]/g, ""));
            setMessage(null);
          }}
          className={`${fieldClass} w-32`}
        />
        <select
          value={basis}
          disabled={readOnly || !strict}
          onChange={(e) => {
            setBasis(e.target.value as Level);
            setMessage(null);
          }}
          className={fieldClass}
        >
          <option value="STORAGE">{labels.pda_basis_storage}</option>
          <option value="PRIMARY">{labels.pda_basis_primary}</option>
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="text-sm font-medium">{labels.pda_lookup}</div>
        <p className="text-xs text-zinc-500 mt-1 max-w-md">{labels.pda_lookup_description}</p>
        <div className="space-y-1.5 mt-4">
          {check(lookup.includes("SKU"), (on) => setLookup(toggle(lookup, "SKU", on)), labels.pda_lookup_sku)}
          {check(lookup.includes("LEGACY_SKU"), (on) => setLookup(toggle(lookup, "LEGACY_SKU", on)), labels.pda_lookup_legacy)}
          {check(lookup.includes("BARCODE"), (on) => setLookup(toggle(lookup, "BARCODE", on)), labels.pda_lookup_barcode)}
          {lookup.length === 0 && <p className="text-xs text-red-400">{labels.pda_need_one}</p>}
        </div>
      </div>

      <div className={card}>
        <div className="text-sm font-medium">{labels.pda_units}</div>
        <p className="text-xs text-zinc-500 mt-1 max-w-md">{labels.pda_units_description}</p>
        <div className="grid grid-cols-2 gap-6 mt-4">
          <div>
            <div className="text-xs text-zinc-500 mb-2">{labels.pda_units_picking}</div>
            {unitChecks(pickUnits, setPickUnits)}
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-2">{labels.pda_units_shipping}</div>
            {unitChecks(shipUnits, setShipUnits)}
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{labels.pda_strict}</div>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">{labels.pda_strict_description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={strict}
            disabled={readOnly}
            onClick={() => {
              setStrict(!strict);
              setMessage(null);
            }}
            className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${
              strict ? "bg-amber-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                strict ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        <div className={`space-y-2 mt-4 ${strict ? "" : "opacity-50"}`}>
          {maxRow(labels.pda_max_pick, maxPick, setMaxPick, maxPickBasis, setMaxPickBasis)}
          {maxRow(labels.pda_max_ship, maxShip, setMaxShip, maxShipBasis, setMaxShipBasis)}
          <p className="text-xs text-zinc-500 max-w-md">{labels.pda_basis_note}</p>
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || invalid}
            className="px-3 py-1.5 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium disabled:opacity-40"
          >
            {saving ? "Saving…" : labels.pda_save}
          </button>
          {message && (
            <span className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{message.text}</span>
          )}
        </div>
      )}
    </div>
  );
}
