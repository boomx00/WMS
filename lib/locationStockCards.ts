// Server-only: the Location Stock summary cards (Settings → Location Stock
// Cards, location_stock_cards table). Each card adds up the stock in the
// location types ticked for it, shown in its units (none = each product's
// primary unit). The adding up itself is lib/locationStockUnits.ts.

import { locationStockCards, locationTypes, units } from "@/db/schema";
import { and, asc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { TotalUnit } from "@/lib/locationStockUnits";

export type LocationStockCard = {
  id: number;
  name: string;
  nameId: string | null;
  nameZh: string | null;
  locationTypes: string[]; // location_types.code
  unitIds: number[]; // [] = automatic
  sortOrder: number;
};

// A card as the Location Stock page uses it: its units resolved, in order
// (null = automatic). Unknown unit ids (a deleted unit) are skipped.
export type ResolvedLocationStockCard = Omit<LocationStockCard, "unitIds" | "sortOrder"> & {
  units: TotalUnit[] | null;
};

const columns = {
  id: locationStockCards.id,
  name: locationStockCards.name,
  nameId: locationStockCards.nameId,
  nameZh: locationStockCards.nameZh,
  locationTypes: locationStockCards.locationTypes,
  unitIds: locationStockCards.unitIds,
  sortOrder: locationStockCards.sortOrder,
};

function normalize(row: { unitIds: number[] | null } & Omit<LocationStockCard, "unitIds">): LocationStockCard {
  return { ...row, locationTypes: row.locationTypes ?? [], unitIds: row.unitIds ?? [] };
}

// Every card, in display order.
export async function getLocationStockCards(db: any): Promise<LocationStockCard[]> {
  const rows = await db
    .select(columns)
    .from(locationStockCards)
    .orderBy(asc(locationStockCards.sortOrder), asc(locationStockCards.id));
  return rows.map(normalize);
}

export async function getLocationStockCard(db: any, id: number): Promise<LocationStockCard | null> {
  const [row] = await db.select(columns).from(locationStockCards).where(eq(locationStockCards.id, id));
  return row ? normalize(row) : null;
}

// Every card with its units looked up, for the Location Stock page.
export async function getResolvedLocationStockCards(db: any): Promise<ResolvedLocationStockCard[]> {
  const cards = await getLocationStockCards(db);
  const allIds = Array.from(new Set(cards.flatMap((c) => c.unitIds)));
  const found: TotalUnit[] = allIds.length
    ? await db
        .select({ id: units.id, code: units.code, name: units.name, nameId: units.nameId, nameZh: units.nameZh, decimals: units.decimals })
        .from(units)
        .where(inArray(units.id, allIds))
    : [];
  const byId = new Map(found.map((u) => [u.id, u]));
  return cards.map((card) => {
    const resolved = card.unitIds.map((id) => byId.get(id)).filter((u): u is TotalUnit => !!u);
    return {
      id: card.id,
      name: card.name,
      nameId: card.nameId,
      nameZh: card.nameZh,
      locationTypes: card.locationTypes,
      units: resolved.length ? resolved : null,
    };
  });
}

// Request cleaners. Each returns the cleaned value, or { error }.

export function cleanCardName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\0/g, "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

// An optional translated name: trimmed, or null when left empty.
export function cleanCardTranslation(value: unknown): string | null {
  return cleanCardName(value) || null;
}

// Location type codes: must all exist. At least one.
export async function cleanCardLocationTypes(db: any, value: unknown): Promise<string[] | { error: string }> {
  if (!Array.isArray(value)) return { error: "Choose the location types for this card" };
  const codes = Array.from(new Set(value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())));
  if (codes.length === 0) return { error: "Choose at least one location type" };
  const found: { code: string }[] = await db
    .select({ code: locationTypes.code })
    .from(locationTypes)
    .where(inArray(locationTypes.code, codes));
  if (found.length !== codes.length) return { error: "Unknown location type" };
  return codes;
}

// Unit ids, in order: must all exist. Empty / null = automatic.
export async function cleanCardUnitIds(db: any, value: unknown): Promise<number[] | { error: string }> {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return { error: "Invalid units" };
  const ids = Array.from(new Set(value.map(Number)));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || ids.length > 20) return { error: "Invalid units" };
  if (ids.length === 0) return [];
  const found: { id: number }[] = await db.select({ id: units.id }).from(units).where(inArray(units.id, ids));
  if (found.length !== ids.length) return { error: "Unknown unit" };
  return ids;
}

// Case-insensitive, so "Total Floor" and "total floor" can't both exist.
export async function cardNameTaken(db: any, name: string, exceptId?: number): Promise<boolean> {
  const conditions: SQL[] = [sql`lower(${locationStockCards.name}) = lower(${name})`];
  if (exceptId) conditions.push(ne(locationStockCards.id, exceptId));
  const [row] = await db.select({ id: locationStockCards.id }).from(locationStockCards).where(and(...conditions));
  return !!row;
}

export async function nextCardSortOrder(db: any): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`(coalesce(max(${locationStockCards.sortOrder}), 0) + 10)::int` })
    .from(locationStockCards);
  return row?.next ?? 10;
}
