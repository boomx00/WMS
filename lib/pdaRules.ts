// Server-only: PDA rules from Settings → PDA.
//
//   - Units the PDA offers for typing a quantity when picking / shipping
//     (the product's storage unit, e.g. Pallet, and / or its primary unit,
//     e.g. Carton — names from the product's category).
//   - Strict mode: while on, one pick / one ship may move at most a set
//     amount, so 500 cartons can't "ship" in one go when the truck is
//     loaded pallet by pallet. Enforced on the API routes, not only the PDA.
//   - Which fields a scanned / typed product code is matched against
//     (lib/itemLookup.ts).

import { items, productCategories, settings, units } from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { eq, inArray } from "drizzle-orm";

export type PdaUnitLevel = "STORAGE" | "PRIMARY";
export type ItemLookupField = "SKU" | "LEGACY_SKU" | "BARCODE";
export type PdaActivity = "pick" | "ship";

export const PDA_UNIT_LEVELS: PdaUnitLevel[] = ["STORAGE", "PRIMARY"];
export const ITEM_LOOKUP_FIELDS: ItemLookupField[] = ["SKU", "LEGACY_SKU", "BARCODE"];

export type PdaLimit = { qty: number; basis: PdaUnitLevel };

export type PdaRules = {
  pickUnits: PdaUnitLevel[];
  shipUnits: PdaUnitLevel[];
  strictMode: boolean;
  // As set, whether or not strict mode is on (for the Settings page).
  maxPick: PdaLimit | null;
  maxShip: PdaLimit | null;
  itemLookupFields: ItemLookupField[];
};

export const DEFAULT_PDA_RULES: PdaRules = {
  pickUnits: ["STORAGE", "PRIMARY"],
  shipUnits: ["PRIMARY"],
  strictMode: false,
  maxPick: null,
  maxShip: null,
  itemLookupFields: ["SKU", "LEGACY_SKU", "BARCODE"],
};

// ── Cleaning (also used by PATCH /api/settings) ─────────────────────────

// A list of allowed values: known ones only, no duplicates, in canonical
// order. null when the input isn't an array or keeps nothing.
function cleanList<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value)) return null;
  const set = new Set(value.filter((v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v)));
  const out = allowed.filter((v) => set.has(v));
  return out.length > 0 ? out : null;
}

export const cleanUnitLevels = (value: unknown) => cleanList(value, PDA_UNIT_LEVELS);
export const cleanLookupFields = (value: unknown) => cleanList(value, ITEM_LOOKUP_FIELDS);

export function cleanBasis(value: unknown): PdaUnitLevel | null {
  return value === "STORAGE" || value === "PRIMARY" ? value : null;
}

// A maximum: null clears it; otherwise a whole number from 1. undefined = invalid.
export function cleanMaxQty(value: unknown): number | null | undefined {
  if (value === null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 1_000_000) return undefined;
  return n;
}

// ── Loading ─────────────────────────────────────────────────────────────

export async function getPdaRules(db: any): Promise<PdaRules> {
  const [row] = await db.select().from(settings).limit(1);
  if (!row) return DEFAULT_PDA_RULES;
  return {
    pickUnits: cleanUnitLevels(row.pdaPickUnits) ?? DEFAULT_PDA_RULES.pickUnits,
    shipUnits: cleanUnitLevels(row.pdaShipUnits) ?? DEFAULT_PDA_RULES.shipUnits,
    strictMode: row.pdaStrictMode ?? false,
    maxPick: row.pdaMaxPickQty ? { qty: row.pdaMaxPickQty, basis: cleanBasis(row.pdaMaxPickBasis) ?? "STORAGE" } : null,
    maxShip: row.pdaMaxShipQty ? { qty: row.pdaMaxShipQty, basis: cleanBasis(row.pdaMaxShipBasis) ?? "STORAGE" } : null,
    itemLookupFields: cleanLookupFields(row.itemLookupFields) ?? DEFAULT_PDA_RULES.itemLookupFields,
  };
}

// The maximum that applies right now: null unless strict mode is on.
export function activeLimit(rules: PdaRules, activity: PdaActivity): PdaLimit | null {
  if (!rules.strictMode) return null;
  return activity === "pick" ? rules.maxPick : rules.maxShip;
}

// ── A product's units, as the PDA shows them ────────────────────────────

export type PdaItemUnits = {
  primaryCode: string;
  primaryName: string;
  // Null when the product's category has no storage unit.
  storageCode: string | null;
  storageName: string | null;
  // Primary units per 1 storage unit (items.pallet_carton_qty).
  storageQty: number;
};

// Products with no category keep the old fixed Carton / Pallet.
const LEGACY_UNITS = (storageQty: number): PdaItemUnits => ({
  primaryCode: "CTN",
  primaryName: "Carton",
  storageCode: "PLT",
  storageName: "Pallet",
  storageQty: Math.max(1, storageQty),
});

const pdaPrimaryUnit = alias(units, "pda_primary_unit");
const pdaStorageUnit = alias(units, "pda_storage_unit");

export async function getPdaItemUnits(db: any, itemIds: number[]): Promise<Map<number, PdaItemUnits>> {
  const result = new Map<number, PdaItemUnits>();
  const ids = Array.from(new Set(itemIds));
  if (ids.length === 0) return result;

  const rows: {
    itemId: number;
    categoryId: number | null;
    storageQty: number;
    primaryCode: string | null;
    primaryName: string | null;
    storageCode: string | null;
    storageName: string | null;
  }[] = await db
    .select({
      itemId: items.id,
      categoryId: items.categoryId,
      storageQty: items.palletCartonQty,
      primaryCode: pdaPrimaryUnit.code,
      primaryName: pdaPrimaryUnit.name,
      storageCode: pdaStorageUnit.code,
      storageName: pdaStorageUnit.name,
    })
    .from(items)
    .leftJoin(productCategories, eq(items.categoryId, productCategories.id))
    .leftJoin(pdaPrimaryUnit, eq(productCategories.primaryUnitId, pdaPrimaryUnit.id))
    .leftJoin(pdaStorageUnit, eq(productCategories.storageUnitId, pdaStorageUnit.id))
    .where(inArray(items.id, ids));

  for (const r of rows) {
    if (r.categoryId === null || !r.primaryCode) {
      result.set(r.itemId, LEGACY_UNITS(r.storageQty));
      continue;
    }
    result.set(r.itemId, {
      primaryCode: r.primaryCode,
      primaryName: r.primaryName ?? r.primaryCode,
      storageCode: r.storageCode,
      storageName: r.storageCode ? r.storageName ?? r.storageCode : null,
      storageQty: r.storageCode ? Math.max(1, r.storageQty) : 1,
    });
  }
  return result;
}

export async function getOnePdaItemUnits(db: any, itemId: number): Promise<PdaItemUnits> {
  return (await getPdaItemUnits(db, [itemId])).get(itemId) ?? LEGACY_UNITS(1);
}

// ── Strict-mode check ───────────────────────────────────────────────────

// The most this product may move in one activity, in its primary unit, or
// null for no maximum. A storage-unit maximum doesn't apply to products
// whose category has no storage unit.
export function maxPrimaryQty(limit: PdaLimit | null, u: PdaItemUnits): number | null {
  if (!limit) return null;
  if (limit.basis === "PRIMARY") return limit.qty;
  if (!u.storageCode) return null;
  return limit.qty * u.storageQty;
}

// An error message when `quantity` (primary units) is over the maximum for
// this activity, else null. Loads the rules and the product's units itself.
export async function checkPdaLimit(
  db: any,
  activity: PdaActivity,
  item: { id: number; sku: string },
  quantity: number
): Promise<string | null> {
  const rules = await getPdaRules(db);
  const limit = activeLimit(rules, activity);
  if (!limit) return null;
  const u = await getOnePdaItemUnits(db, item.id);
  const max = maxPrimaryQty(limit, u);
  if (max === null || quantity <= max) return null;

  const what = activity === "pick" ? "picking" : "shipping";
  const asSet =
    limit.basis === "STORAGE"
      ? `${limit.qty} ${u.storageName} (${max} ${u.primaryName})`
      : `${max} ${u.primaryName}`;
  return `Mode ketat: maksimal ${asSet} per ${what} untuk ${item.sku}. Pisahkan jadi beberapa kali scan.`;
}
