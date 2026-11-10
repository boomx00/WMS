// The units Total Stock shows for a product, from its category (Items page →
// Product categories). Plain module (no "use client") so both the server
// page and the client table can import it.

import { unitName } from "@/lib/uom";
import type { Language } from "@/lib/language";

export type NamedUnit = { code: string; name: string; nameId: string | null; nameZh: string | null };

export type SkuUnits = {
  primary: NamedUnit; // e.g. Carton — what quantities and totals count
  secondaryCode: string | null; // e.g. PK — loose packs
  storage: NamedUnit | null; // e.g. Pallet — null: no storage unit
};

// Products with no category yet show as before: Carton / Pack / Pallet.
export const DEFAULT_SKU_UNITS: SkuUnits = {
  primary: { code: "CTN", name: "Carton", nameId: "Karton", nameZh: "箱" },
  secondaryCode: "PK",
  storage: { code: "PLT", name: "Pallet", nameId: "Palet", nameZh: "托盘" },
};

// The one unit every product shares (by code), or null when they differ.
export function sharedUnit(list: (NamedUnit | null)[]): NamedUnit | null | "mixed" {
  if (list.length === 0) return null;
  const first = list[0];
  for (const u of list) {
    if ((u?.code ?? null) !== (first?.code ?? null)) return "mixed";
  }
  return first;
}

// A label with "{unit}" / "{storage}" filled in. When the products on the
// tab use different units (or none), "({unit})" is dropped: "Total ({unit})"
// becomes "Total". Labels without a placeholder are shown as written.
export function fillUnitLabel(
  label: string,
  placeholder: "unit" | "storage",
  unit: NamedUnit | null | "mixed",
  language: Language,
  fallback: string
): string {
  const token = `{${placeholder}}`;
  if (!label.includes(token)) return label;
  if (unit && unit !== "mixed") return label.replaceAll(token, unitName(unit, language));
  const without = label
    .replace(new RegExp(`\\s*\\(\\{${placeholder}\\}\\)`, "g"), "")
    .replaceAll(token, "")
    .trim();
  return without || fallback;
}
