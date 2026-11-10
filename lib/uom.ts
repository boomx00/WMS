// Pure unit-of-measure helpers — no server imports, so pages and the API
// can both use them (lib/units.ts has the queries).
//
// A product's units come from its category (db/schema/units.ts):
//   primary   e.g. Carton
//   secondary e.g. Pack, optional — `ratio` of them make one primary
//   storage   e.g. Pallet, optional — `storageQty` primary units fill one
//
// "Base" quantities are whole numbers of the smallest step of the smallest
// unit: packs for Carton / Pack, grams for a Kilogram unit with 3 decimals.
// Stock is not stored in base units yet (it is still cartons + loose packs);
// these helpers are what the conversion will go through.

import type { Language } from "@/lib/language";

export type UnitInfo = {
  id: number;
  code: string;
  name: string;
  nameId: string | null;
  nameZh: string | null;
  decimals: number;
  sortOrder: number;
};

export type CategoryInfo = {
  id: number;
  name: string;
  primaryUnitId: number;
  secondaryUnitId: number | null;
  defaultRatio: number | null;
  storageUnitId: number | null;
  defaultStorageQty: number | null;
  sortOrder: number;
};

export type ItemUom = {
  primary: UnitInfo;
  secondary: UnitInfo | null;
  ratio: number; // secondary per 1 primary (1 when there is no secondary)
  storage: UnitInfo | null;
  storageQty: number; // primary per 1 storage unit (1 when there is no storage unit)
};

export type UomLevel = "primary" | "secondary";

// Most decimals a unit can have — stock columns hold 3 (db/schema/qty.ts).
export const MAX_UNIT_DECIMALS = 3;

// The unit's name in the given language (falls back to the English name).
export function unitName(unit: Pick<UnitInfo, "name" | "nameId" | "nameZh">, lang: Language = "en"): string {
  if (lang === "id") return unit.nameId || unit.name;
  if (lang === "zh") return unit.nameZh || unit.name;
  return unit.name;
}

// A product's units, from its category and its own ratios. null when the
// product has no category (or the category / its units can't be found).
export function resolveItemUom(
  item: { categoryId: number | null; cartonBagQty: number; palletCartonQty: number },
  categories: Map<number, CategoryInfo>,
  units: Map<number, UnitInfo>
): ItemUom | null {
  if (item.categoryId === null) return null;
  const category = categories.get(item.categoryId);
  if (!category) return null;
  const primary = units.get(category.primaryUnitId);
  if (!primary) return null;
  const secondary = category.secondaryUnitId === null ? null : units.get(category.secondaryUnitId) ?? null;
  const storage = category.storageUnitId === null ? null : units.get(category.storageUnitId) ?? null;
  return {
    primary,
    secondary,
    ratio: secondary ? Math.max(1, item.cartonBagQty) : 1,
    storage,
    storageQty: storage ? Math.max(1, item.palletCartonQty) : 1,
  };
}

const pow10 = (n: number) => 10 ** Math.max(0, Math.min(MAX_UNIT_DECIMALS, n));

// Base steps in 1 of the given unit level.
export function baseFactor(uom: ItemUom, level: UomLevel): number {
  if (uom.secondary) {
    const step = pow10(uom.secondary.decimals);
    return level === "secondary" ? step : uom.ratio * step;
  }
  return pow10(uom.primary.decimals);
}

// Base steps in 1 storage unit (null when the product has none).
export function storageBaseFactor(uom: ItemUom): number | null {
  return uom.storage ? uom.storageQty * baseFactor(uom, "primary") : null;
}

// A quantity typed in a unit → base. null when it has more decimals than
// the unit allows (e.g. 2.5 packs) or isn't a finite number.
export function toBase(uom: ItemUom, qty: number, level: UomLevel = "primary"): number | null {
  if (!Number.isFinite(qty)) return null;
  const unit = level === "secondary" && uom.secondary ? uom.secondary : uom.primary;
  const scaled = qty * pow10(unit.decimals);
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) return null;
  const perStep = baseFactor(uom, level) / pow10(unit.decimals);
  return rounded * perStep;
}

// Several units typed together ("30 ctn + 5 pk") → base.
export function partsToBase(uom: ItemUom, primary: number, secondary = 0): number | null {
  const a = toBase(uom, primary, "primary");
  const b = uom.secondary ? toBase(uom, secondary, "secondary") : secondary === 0 ? 0 : null;
  return a === null || b === null ? null : a + b;
}

// Base → whole primary units and the rest in secondary units:
// 245 packs at 8 per carton → { primary: 30, secondary: 5 }. Negative
// quantities split the same way with both parts negative.
export function splitBase(uom: ItemUom, base: number): { primary: number; secondary: number } {
  const sign = base < 0 ? -1 : 1;
  const abs = Math.abs(base);
  if (!uom.secondary) {
    return { primary: (sign * abs) / baseFactor(uom, "primary"), secondary: 0 };
  }
  const perPrimary = baseFactor(uom, "primary");
  const whole = Math.floor(abs / perPrimary);
  const rest = (abs - whole * perPrimary) / baseFactor(uom, "secondary");
  return { primary: sign * whole, secondary: sign * rest };
}

// Base → primary units as a decimal (245 packs at 8 per carton → 30.625).
export function baseToPrimary(uom: ItemUom, base: number): number {
  return base / baseFactor(uom, "primary");
}

function formatNumber(n: number, maxDecimals: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

// Base → text for tables:
//   "split"   → "30 CTN + 5 PK" (just "30 CTN" when nothing is left over)
//   "primary" → "30.63 CTN"
export function formatBase(uom: ItemUom, base: number, style: "split" | "primary" = "split"): string {
  if (style === "primary" || !uom.secondary) {
    const decimals = uom.secondary ? 2 : uom.primary.decimals;
    return `${formatNumber(baseToPrimary(uom, base), decimals)} ${uom.primary.code}`;
  }
  const { primary, secondary } = splitBase(uom, base);
  const main = `${formatNumber(primary, 0)} ${uom.primary.code}`;
  if (secondary === 0) return main;
  const rest = `${formatNumber(Math.abs(secondary), uom.secondary.decimals)} ${uom.secondary.code}`;
  return primary === 0 ? `${secondary < 0 ? "-" : ""}${rest}` : `${main} + ${rest}`;
}

// "8 PK / CTN" — the product's ratio as shown on the Items page.
export function ratioLabel(uom: ItemUom): string | null {
  return uom.secondary ? `${uom.ratio} ${uom.secondary.code} / ${uom.primary.code}` : null;
}

// "14 CTN / PLT" — the product's storage qty as shown on the Items page.
export function storageLabel(uom: ItemUom): string | null {
  return uom.storage ? `${uom.storageQty} ${uom.primary.code} / ${uom.storage.code}` : null;
}

// Stock quantities hold up to 3 decimals: round away float noise
// (12.3 - 12.1 = 0.20000000000000107 → 0.2).
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Whether a quantity has no more decimals than the unit allows (2.5 for a
// 0-decimal Pack → false; 12.5 for a 3-decimal Kilogram → true).
export function fitsDecimals(qty: number, decimals: number): boolean {
  if (!Number.isFinite(qty)) return false;
  const scaled = qty * pow10(decimals);
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

// The `step` for a quantity <input>: "1", "0.1", "0.001".
export function stepFor(decimals: number): string {
  return decimals <= 0 ? "1" : (1 / pow10(decimals)).toFixed(Math.min(decimals, MAX_UNIT_DECIMALS));
}

// Cleaners for request bodies (shared by the units / categories routes).

const MAX_CODE = 12;
const MAX_NAME = 60;

export function cleanUnitCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, "").trim().slice(0, MAX_CODE);
  return v || null;
}

export function cleanName(value: unknown, max = MAX_NAME): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\0/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return v || null;
}

// A positive whole number, null for "" / null (cleared), undefined when the
// value isn't a positive whole number.
export function cleanPositiveInt(value: unknown): number | null | undefined {
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// An id from a request: a positive integer, null to clear ("" / null),
// undefined when it's something else.
export function cleanId(value: unknown): number | null | undefined {
  return cleanPositiveInt(value);
}
