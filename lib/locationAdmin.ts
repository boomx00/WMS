// Server-only rules for the Locations page: listing, creating and editing
// location types (/api/location-types) and locations (/api/locations).
// Validation returns an AdminError the route sends back as-is, so POST and
// PATCH share one set of rules.

import { locations, locationTypes, locationStock, stockColumns, warehouses } from "@/db/schema";
import { and, asc, eq, getTableColumns, ne, inArray, sql, type SQL } from "drizzle-orm";
import { type LocationRow, type LocationTypeRules } from "@/lib/locationRules";
import { LOCKED_LOCATION_CODES, TYPE_LOCKED_LOCATION_CODES } from "@/lib/locationLocks";
import { getWarehouseById, resolveWarehouse } from "@/lib/warehouses";

export type AdminError = {
  error: string;
  status: number;
};

export function isAdminError(value: unknown): value is AdminError {
  return typeof value === "object" && value !== null && "error" in value && "status" in value;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim() : "";
}

function listCodes(codes: string[]): string {
  return codes.length <= 5 ? codes.join(", ") : `${codes.slice(0, 5).join(", ")} and ${codes.length - 5} more`;
}

// Postgres unique-violation, e.g. two people saving the same code at once.
// Drizzle wraps driver errors, with the Postgres error as `cause`.
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// ============================================================
// Lists for the page
// ============================================================

export type LocationTypeListRow = LocationTypeRules & { locationCount: number };

export type LocationListRow = {
  id: number;
  code: string;
  type: string;
  area: string | null;
  x: number | null;
  y: number | null;
  warehouseId: number;
  isReceiving: boolean;
  isStaging: boolean;
  countsInTotalStock: boolean;
  stockColumnId: number | null; // Total Stock column; null = total only
  skuCount: number; // distinct SKUs currently held (non-zero stock)
};

export async function listLocationTypesWithCounts(db: any): Promise<LocationTypeListRow[]> {
  return db
    .select({
      ...getTableColumns(locationTypes),
      locationCount: sql<number>`count(${locations.id})::int`,
    })
    .from(locationTypes)
    .leftJoin(locations, eq(locations.type, locationTypes.code))
    .groupBy(locationTypes.id)
    .orderBy(asc(locationTypes.sortOrder), asc(locationTypes.name));
}

export async function listLocationsForAdmin(db: any): Promise<LocationListRow[]> {
  const [rows, skuCounts] = await Promise.all([
    db
      .select({
        id: locations.id,
        code: locations.code,
        type: locations.type,
        area: locations.area,
        x: locations.x,
        y: locations.y,
        warehouseId: locations.warehouseId,
        isReceiving: locations.isReceiving,
        isStaging: locations.isStaging,
        countsInTotalStock: locations.countsInTotalStock,
        stockColumnId: locations.stockColumnId,
      })
      .from(locations)
      .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
      // Types in display order; within a type, by position, then code.
      .orderBy(
        asc(locationTypes.sortOrder),
        asc(locations.area),
        asc(locations.x),
        asc(locations.y),
        asc(locations.code)
      ),
    db
      .select({
        locationId: locationStock.locationId,
        skuCount: sql<number>`count(distinct ${locationStock.itemId})::int`,
      })
      .from(locationStock)
      .where(ne(locationStock.quantity, 0))
      .groupBy(locationStock.locationId),
  ]);

  const countById = new Map<number, number>(
    skuCounts.map((r: { locationId: number; skuCount: number }) => [r.locationId, r.skuCount])
  );
  return rows.map((r: Omit<LocationListRow, "skuCount">) => ({ ...r, skuCount: countById.get(r.id) ?? 0 }));
}

// Codes of the given locations that currently hold more than one SKU.
export async function locationsWithMultipleSkus(db: any, locationIds: number[]): Promise<string[]> {
  if (locationIds.length === 0) return [];
  const rows = await db
    .select({ code: locations.code })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .where(and(inArray(locationStock.locationId, locationIds), ne(locationStock.quantity, 0)))
    .groupBy(locations.id, locations.code)
    .having(sql`count(distinct ${locationStock.itemId}) > 1`)
    .orderBy(asc(locations.code));
  return rows.map((r: { code: string }) => r.code);
}

// ============================================================
// Location types
// ============================================================

export type LocationTypeInput = {
  name: string;
  allowsMultipleSku: boolean;
  hasPosition: boolean;
  pickable: boolean;
  maxPallets: number | null;
};

// Every field is required — the popup always sends the whole type.
export function parseLocationTypeInput(body: any): LocationTypeInput | AdminError {
  const name = cleanText(body?.name);
  if (!name) return { error: "Name is required", status: 400 };

  for (const key of ["allowsMultipleSku", "hasPosition", "pickable"] as const) {
    if (typeof body?.[key] !== "boolean") {
      return { error: `${key} must be true or false`, status: 400 };
    }
  }

  let maxPallets: number | null = null;
  if (body.maxPallets !== null && body.maxPallets !== undefined && body.maxPallets !== "") {
    const n = Number(body.maxPallets);
    if (!Number.isInteger(n) || n <= 0) {
      return { error: "Max pallets must be a whole number above 0, or empty for no limit", status: 400 };
    }
    maxPallets = n;
  }

  return {
    name,
    allowsMultipleSku: body.allowsMultipleSku,
    hasPosition: body.hasPosition,
    pickable: body.pickable,
    maxPallets,
  };
}

// "Cold Room" -> "COLD_ROOM"; made unique with _2, _3, ... The code is what
// locations.type stores, so it's set once and never changes.
export async function generateTypeCode(db: any, name: string): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "TYPE";
  const rows: { code: string }[] = await db.select({ code: locationTypes.code }).from(locationTypes);
  const taken = new Set(rows.map((r) => r.code));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function checkTypeNameFree(db: any, name: string, exceptId?: number): Promise<AdminError | null> {
  const where: SQL = exceptId
    ? and(sql`lower(${locationTypes.name}) = lower(${name})`, ne(locationTypes.id, exceptId))!
    : sql`lower(${locationTypes.name}) = lower(${name})`;
  const [clash] = await db.select({ id: locationTypes.id }).from(locationTypes).where(where);
  return clash ? { error: `A type named "${name}" already exists`, status: 409 } : null;
}

// Switching a type to "only 1 SKU" while some of its locations hold several.
export async function checkTypeRuleChange(
  db: any,
  existing: LocationTypeRules,
  input: LocationTypeInput
): Promise<AdminError | null> {
  if (existing.allowsMultipleSku && !input.allowsMultipleSku) {
    const rows: { id: number }[] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.type, existing.code));
    const crowded = await locationsWithMultipleSkus(db, rows.map((r) => r.id));
    if (crowded.length > 0) {
      return {
        error: `Can't switch to 1 SKU: ${listCodes(crowded)} currently ${crowded.length === 1 ? "holds" : "hold"} more than one SKU. Move the extra SKUs out first.`,
        status: 409,
      };
    }
  }
  return null;
}

export async function nextTypeSortOrder(db: any): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`(coalesce(max(${locationTypes.sortOrder}), 0) + 10)::int` })
    .from(locationTypes);
  return row?.next ?? 10;
}

// ============================================================
// Locations
// ============================================================

export type LocationInput = {
  code: string;
  type: string;
  area: string | null;
  x: number | null;
  y: number | null;
  // null = not sent: an edit keeps the location's warehouse, a new location
  // goes in the default warehouse.
  warehouseId: number | null;
  isReceiving: boolean;
  isStaging: boolean;
  countsInTotalStock: boolean;
  stockColumnId: number | null; // null = counted in the total only
};

export type LocationValues = Omit<LocationInput, "warehouseId"> & { warehouseId: number };

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function parseLocationInput(body: any): LocationInput | AdminError {
  const code = cleanText(body?.code);
  if (!code) return { error: "Location code is required", status: 400 };

  const type = cleanText(body?.type);
  if (!type) return { error: "Type is required", status: 400 };

  const isReceiving = body?.isReceiving ?? false;
  const isStaging = body?.isStaging ?? false;
  if (typeof isReceiving !== "boolean" || typeof isStaging !== "boolean") {
    return { error: "isReceiving and isStaging must be true or false", status: 400 };
  }

  const countsInTotalStock = body?.countsInTotalStock ?? true;
  if (typeof countsInTotalStock !== "boolean") {
    return { error: "countsInTotalStock must be true or false", status: 400 };
  }

  let warehouseId: number | null = null;
  if (body?.warehouseId !== null && body?.warehouseId !== undefined && body?.warehouseId !== "") {
    warehouseId = Number(body.warehouseId);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return { error: "Unknown warehouse", status: 400 };
    }
  }

  let stockColumnId: number | null = null;
  if (body?.stockColumnId !== null && body?.stockColumnId !== undefined && body?.stockColumnId !== "") {
    stockColumnId = Number(body.stockColumnId);
    if (!Number.isInteger(stockColumnId) || stockColumnId <= 0) {
      return { error: "Unknown Total Stock column", status: 400 };
    }
  }

  return {
    code,
    type,
    area: cleanText(body?.area) || null,
    x: toIntOrNull(body?.x),
    y: toIntOrNull(body?.y),
    warehouseId,
    isReceiving,
    isStaging,
    countsInTotalStock,
    // Only counted locations show under a column.
    stockColumnId: countsInTotalStock ? stockColumnId : null,
  };
}

// Checks a new (existing = null) or edited location against its type and
// the rest of the warehouse. Returns the values to write.
export async function validateLocation(
  db: any,
  input: LocationInput,
  existing: LocationRow | null
): Promise<AdminError | { values: LocationValues }> {
  const [rules]: LocationTypeRules[] = await db
    .select()
    .from(locationTypes)
    .where(eq(locationTypes.code, input.type));
  if (!rules) return { error: "Unknown location type", status: 400 };

  // Which warehouse (parent location) it belongs to.
  let warehouseId: number;
  if (input.warehouseId !== null) {
    const warehouse = await getWarehouseById(db, input.warehouseId);
    if (!warehouse) return { error: "That warehouse no longer exists — refresh and try again", status: 400 };
    // Inactive warehouses keep their locations but don't get new ones.
    const joining = !existing || existing.warehouseId !== warehouse.id;
    if (joining && !warehouse.isActive) {
      return {
        error: `${warehouse.name} is inactive — reactivate it on Locations → Warehouses before adding locations to it`,
        status: 400,
      };
    }
    warehouseId = warehouse.id;
  } else if (existing) {
    warehouseId = existing.warehouseId;
  } else {
    const resolved = await resolveWarehouse(db, null);
    if ("error" in resolved) return resolved;
    warehouseId = resolved.warehouse.id;
  }

  // Each warehouse has its own Total Stock columns.
  if (input.stockColumnId !== null) {
    const [column] = await db
      .select({ id: stockColumns.id, warehouseId: stockColumns.warehouseId })
      .from(stockColumns)
      .where(eq(stockColumns.id, input.stockColumnId));
    if (!column) return { error: "That Total Stock column no longer exists — refresh and try again", status: 400 };
    if (column.warehouseId !== warehouseId) {
      return { error: "That Total Stock column belongs to another warehouse — pick one of this warehouse's columns", status: 400 };
    }
  }

  if (existing) {
    if (LOCKED_LOCATION_CODES.includes(existing.code) && input.code !== existing.code) {
      return {
        error: `${existing.code} can't be renamed yet — the PDA still looks it up by this code.`,
        status: 409,
      };
    }
    if (TYPE_LOCKED_LOCATION_CODES.includes(existing.code) && input.type !== existing.type) {
      return {
        error: `${existing.code}'s type can't be changed yet — the PDA still checks for this type.`,
        status: 409,
      };
    }
  }

  const notThis = (where: SQL): SQL => (existing ? and(where, ne(locations.id, existing.id))! : where);

  const [codeClash] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(notThis(eq(locations.code, input.code)));
  if (codeClash) return { error: `Location ${input.code} already exists`, status: 409 };

  // Area / X / Y only for types with a rack position, and one location per spot.
  let area: string | null = null;
  let x: number | null = null;
  let y: number | null = null;
  if (rules.hasPosition) {
    area = input.area;
    x = input.x;
    y = input.y;
    const validCoord = (n: number | null) => n !== null && Number.isInteger(n) && n > 0;
    if (!area || !validCoord(x) || !validCoord(y)) {
      return { error: `${rules.name} locations need an Area, and X and Y as whole numbers above 0`, status: 400 };
    }
    const [spotTaken] = await db
      .select({ code: locations.code })
      .from(locations)
      .where(notThis(and(eq(locations.area, area), eq(locations.x, x!), eq(locations.y, y!))!));
    if (spotTaken) {
      return { error: `${spotTaken.code} is already at Area ${area}, X ${x}, Y ${y}`, status: 409 };
    }
  }

  if (existing && existing.type !== input.type && !rules.allowsMultipleSku) {
    const crowded = await locationsWithMultipleSkus(db, [existing.id]);
    if (crowded.length > 0) {
      return {
        error: `${existing.code} holds more than one SKU, so it can't become ${rules.name} (1 SKU only). Move the extra SKUs out first.`,
        status: 409,
      };
    }
  }

  // Receiving locations hold stock to put away and pick from; staging
  // locations hold picked stock that can't be picked again — one or the other.
  if (input.isReceiving && input.isStaging) {
    return { error: "A location can be Receiving or Staging, not both", status: 400 };
  }

  // Stock in a staging location is picked stock (marked or ecer). Ticking
  // or unticking Staging on a location that holds stock would turn its
  // stock into picked stock, or strand picked stock outside the pool
  // shipping draws from — so it has to be empty first.
  if (existing && existing.isStaging !== input.isStaging) {
    const [held] = await db
      .select({ total: sql<number>`coalesce(sum(${locationStock.quantity}), 0)::int` })
      .from(locationStock)
      .where(and(eq(locationStock.locationId, existing.id), ne(locationStock.quantity, 0)));
    if ((held?.total ?? 0) !== 0) {
      return {
        error: existing.isStaging
          ? `${existing.code} still holds picked stock (${held.total}) — ship or move it out before unticking Staging.`
          : `${existing.code} still holds stock (${held.total}) — move it out before making it a Staging location.`,
        status: 409,
      };
    }
  }

  // The PDA pickers' defaults (Settings → Locations & Marking, per
  // warehouse) must stay receiving / staging locations of their warehouse.
  const movesWarehouse = !!existing && existing.warehouseId !== warehouseId;
  if (
    existing &&
    (movesWarehouse || (existing.isReceiving && !input.isReceiving) || (existing.isStaging && !input.isStaging))
  ) {
    const [owner] = await db
      .select({
        name: warehouses.name,
        receivingId: warehouses.defaultReceivingLocationId,
        stagingId: warehouses.defaultStagingLocationId,
      })
      .from(warehouses)
      .where(eq(warehouses.id, existing.warehouseId))
      .limit(1);
    const losesReceiving = movesWarehouse || (existing.isReceiving && !input.isReceiving);
    const losesStaging = movesWarehouse || (existing.isStaging && !input.isStaging);
    const purpose =
      losesReceiving && owner?.receivingId === existing.id
        ? "receiving"
        : losesStaging && owner?.stagingId === existing.id
          ? "staging"
          : null;
    if (purpose) {
      return {
        error: `${existing.code} is the default ${purpose} location of ${owner!.name} — choose another default on Settings → Locations & Marking first.`,
        status: 409,
      };
    }
  }

  return {
    values: {
      code: input.code,
      type: input.type,
      area,
      x,
      y,
      warehouseId,
      isReceiving: input.isReceiving,
      isStaging: input.isStaging,
      countsInTotalStock: input.countsInTotalStock,
      stockColumnId: input.stockColumnId,
    },
  };
}

// Writes a validated location (insert when existingId is null).
export async function saveLocation(db: any, values: LocationValues, existingId: number | null): Promise<LocationRow> {
  if (existingId === null) {
    const [created] = await db.insert(locations).values(values).returning();
    return created;
  }
  const [updated] = await db.update(locations).set(values).where(eq(locations.id, existingId)).returning();
  return updated;
}
