import { locations, locationTypes, warehouses } from "@/db/schema";
import { and, asc, desc, eq, type SQL } from "drizzle-orm";

// Location types are configured as data (location_types table), so each
// client can define their own. Code should ask about a location's RULES
// (single SKU? pickable? has a rack position?) or PURPOSE (receiving /
// staging) through these helpers, instead of comparing type codes like
// "RACK" or "FLOOR" or location codes like "OUTBOUND_WH".
//
// Every function takes `db` so it works with both the shared db and a
// transaction (`tx`), same as lib/locationStock.ts.

export type LocationTypeRules = typeof locationTypes.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type LocationWithRules = LocationRow & { rules: LocationTypeRules };

// What a location can be used for (checkboxes on the Locations page). Any
// number of locations can have each.
//   receiving = inbound lands here; Move Floor → Rack takes from here
//   staging   = picks go here; ships leave from here
export type LocationPurpose = "receiving" | "staging";

export const PURPOSE_LABELS: Record<LocationPurpose, string> = {
  receiving: "Receiving",
  staging: "Staging",
};

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

// All location types, in display order.
export async function getLocationTypes(db: any): Promise<LocationTypeRules[]> {
  return db
    .select()
    .from(locationTypes)
    .orderBy(asc(locationTypes.sortOrder), asc(locationTypes.name));
}

// type code -> rules. Use when classifying many rows at once (tables,
// ledgers), so it's one query instead of one per row.
export async function getLocationTypeMap(db: any): Promise<Map<string, LocationTypeRules>> {
  const rows = await getLocationTypes(db);
  return new Map(rows.map((r) => [r.code, r]));
}

// ------------------------------------------------------------
// Locations with their type's rules
// ------------------------------------------------------------

async function selectOneWithRules(db: any, where: SQL): Promise<LocationWithRules | null> {
  const [row] = await db
    .select({ location: locations, rules: locationTypes })
    .from(locations)
    .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
    .where(where)
    .limit(1);
  return row ? { ...row.location, rules: row.rules } : null;
}

export function getLocationById(db: any, id: number): Promise<LocationWithRules | null> {
  return selectOneWithRules(db, eq(locations.id, id));
}

export function getLocationByCode(db: any, code: string): Promise<LocationWithRules | null> {
  return selectOneWithRules(db, eq(locations.code, code));
}

// ------------------------------------------------------------
// Receiving / staging locations
// ------------------------------------------------------------

const purposeColumn = (purpose: LocationPurpose) =>
  purpose === "receiving" ? locations.isReceiving : locations.isStaging;

export function hasPurpose(location: Pick<LocationRow, "isReceiving" | "isStaging">, purpose: LocationPurpose): boolean {
  return purpose === "receiving" ? location.isReceiving : location.isStaging;
}

// Every receiving (or staging) location, by code — of one warehouse, or of
// all of them when warehouseId is left out.
export async function getPurposeLocations(
  db: any,
  purpose: LocationPurpose,
  warehouseId?: number | null
): Promise<LocationWithRules[]> {
  const where = warehouseId
    ? and(eq(purposeColumn(purpose), true), eq(locations.warehouseId, warehouseId))
    : eq(purposeColumn(purpose), true);
  const rows = await db
    .select({ location: locations, rules: locationTypes })
    .from(locations)
    .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
    .where(where)
    .orderBy(asc(locations.code));
  return rows.map((r: any) => ({ ...r.location, rules: r.rules }));
}

// Ids of every staging location — the pool that "marked" and "unmarked"
// (ecer) stock is counted across.
export async function getStagingLocationIds(db: any): Promise<number[]> {
  const rows: { id: number }[] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.isStaging, true));
  return rows.map((r) => r.id);
}

// A warehouse's default receiving (or staging) location: the one chosen
// for it on Settings → Locations & Marking, as long as it still has that
// purpose and is still in that warehouse; otherwise the warehouse's only
// such location if it has exactly one; otherwise none. Without a
// warehouseId, the default warehouse (first in display order) — what older
// APKs, which don't know about warehouses, get. (The first active one.)
export async function getDefaultLocation(
  db: any,
  purpose: LocationPurpose,
  warehouseId?: number | null
): Promise<LocationWithRules | null> {
  const [row] = await db
    .select({
      id: warehouses.id,
      receivingId: warehouses.defaultReceivingLocationId,
      stagingId: warehouses.defaultStagingLocationId,
    })
    .from(warehouses)
    .where(warehouseId ? eq(warehouses.id, warehouseId) : undefined)
    // Without a warehouseId: the first active one (lib/warehouses.ts).
    .orderBy(desc(warehouses.isActive), asc(warehouses.sortOrder), asc(warehouses.id))
    .limit(1);
  if (!row) return null;
  const chosenId = purpose === "receiving" ? row.receivingId : row.stagingId;

  if (chosenId) {
    const chosen = await getLocationById(db, chosenId);
    if (chosen && hasPurpose(chosen, purpose) && chosen.warehouseId === row.id) return chosen;
  }

  const all = await getPurposeLocations(db, purpose, row.id);
  return all.length === 1 ? all[0] : null;
}

// The receiving (or staging) location a request should use: the code it
// sent, which must have that purpose, or the warehouse's default when it
// sent none (e.g. scanners on an older APK, which also send no warehouse →
// the default warehouse). Returns an error message otherwise.
export async function resolvePurposeLocation(
  db: any,
  purpose: LocationPurpose,
  code: string | null | undefined,
  warehouseId?: number | null
): Promise<{ location: LocationWithRules } | { error: string; status: number }> {
  const label = PURPOSE_LABELS[purpose].toLowerCase();
  const trimmed = typeof code === "string" ? code.replace(/\0/g, "").trim() : "";

  if (trimmed) {
    const location = await getLocationByCode(db, trimmed);
    if (!location) return { error: `Unknown location ${trimmed}`, status: 404 };
    if (!hasPurpose(location, purpose)) {
      return { error: `${location.code} isn't a ${label} location`, status: 400 };
    }
    return { location };
  }

  const location = await getDefaultLocation(db, purpose, warehouseId);
  if (!location) {
    return {
      error: `No default ${label} location is set — choose one on Settings → Locations & Marking`,
      status: 500,
    };
  }
  return { location };
}

// ------------------------------------------------------------
// Rule checks (no DB access)
// ------------------------------------------------------------

// Only one SKU may be stored per location (today: RACK).
export function isSingleSku(rules: Pick<LocationTypeRules, "allowsMultipleSku">): boolean {
  return !rules.allowsMultipleSku;
}

// Picking more than the recorded quantity is only allowed where stock
// isn't tracked to the exact SKU and quantity: pickable mixed-SKU
// locations (today: FLOOR). Single-SKU locations hold an exactly-known
// quantity, so a short pick there means the record is wrong.
export function allowsDefaultPicking(rules: Pick<LocationTypeRules, "pickable" | "allowsMultipleSku">): boolean {
  return rules.pickable && rules.allowsMultipleSku;
}

// Open pick areas: pickable, but without a rack position (today: the FLOOR
// type — FLOOR, EXPOR, DEFECT). Stock comes in here and gets put away to
// positioned locations; Location Stock's "Floor" figure and the driver
// analytics' Inbound count are based on this.
export function isOpenPickArea(rules: Pick<LocationTypeRules, "pickable" | "hasPosition">): boolean {
  return rules.pickable && !rules.hasPosition;
}

// Pallet cap for a location, or null when the type has no limit.
export function maxPalletsFor(rules: Pick<LocationTypeRules, "maxPallets">): number | null {
  return rules.maxPallets ?? null;
}
