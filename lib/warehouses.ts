// Server-only: warehouses (parent locations), e.g. Finished Goods and Raw
// Material. Every location belongs to one. Each warehouse has its own Total
// Stock tab (with its own columns) and its own default receiving / staging
// locations for the PDA pickers. Managed on Locations → Warehouses.

import { locations, warehouses } from "@/db/schema";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

export type Warehouse = typeof warehouses.$inferSelect;
export type WarehouseListRow = {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
  defaultReceivingLocationId: number | null;
  defaultStagingLocationId: number | null;
  locationCount: number;
};

// All warehouses in display order (active and inactive). The first ACTIVE
// one is the default warehouse: requests that don't say which (older APKs,
// pages opened without a tab) use it.
export async function getWarehouses(db: any): Promise<Warehouse[]> {
  return db.select().from(warehouses).orderBy(asc(warehouses.sortOrder), asc(warehouses.id));
}

export async function listWarehousesWithCounts(db: any): Promise<WarehouseListRow[]> {
  return db
    .select({
      id: warehouses.id,
      name: warehouses.name,
      sortOrder: warehouses.sortOrder,
      isActive: warehouses.isActive,
      defaultReceivingLocationId: warehouses.defaultReceivingLocationId,
      defaultStagingLocationId: warehouses.defaultStagingLocationId,
      locationCount: sql<number>`count(${locations.id})::int`,
    })
    .from(warehouses)
    .leftJoin(locations, eq(locations.warehouseId, warehouses.id))
    .groupBy(warehouses.id)
    .orderBy(asc(warehouses.sortOrder), asc(warehouses.id));
}

export async function getWarehouseById(db: any, id: number): Promise<Warehouse | null> {
  const [row] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  return row ?? null;
}

// The first active warehouse (or the first one at all, if every one is
// somehow inactive).
export async function getDefaultWarehouse(db: any): Promise<Warehouse | null> {
  const [row] = await db
    .select()
    .from(warehouses)
    .orderBy(desc(warehouses.isActive), asc(warehouses.sortOrder), asc(warehouses.id))
    .limit(1);
  return row ?? null;
}

// Same rule on an already-loaded list (in display order).
export function pickDefaultWarehouse<T extends { isActive: boolean }>(list: T[]): T | null {
  return list.find((w) => w.isActive) ?? list[0] ?? null;
}

// A warehouse id from a query string or body: a positive whole number, or
// null when it's missing or not a number.
export function parseWarehouseId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// The warehouse a request means: the id it sent (which must exist — and be
// active, with activeOnly, e.g. for the PDA), or the default warehouse when
// it sent none.
export async function resolveWarehouse(
  db: any,
  value: unknown,
  { activeOnly = false }: { activeOnly?: boolean } = {}
): Promise<{ warehouse: Warehouse } | { error: string; status: number }> {
  const missing = value === null || value === undefined || value === "";
  if (missing) {
    const warehouse = await getDefaultWarehouse(db);
    if (!warehouse) return { error: "No warehouses yet — add one on Locations → Warehouses", status: 500 };
    return { warehouse };
  }
  const id = parseWarehouseId(value);
  const warehouse = id ? await getWarehouseById(db, id) : null;
  if (!warehouse) return { error: "That warehouse no longer exists — refresh and try again", status: 404 };
  if (activeOnly && !warehouse.isActive) return { error: `${warehouse.name} is inactive`, status: 404 };
  return { warehouse };
}

export function cleanWarehouseName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim() : "";
}

// Case-insensitive, so "raw material" and "Raw Material" can't both exist.
export async function warehouseNameTaken(db: any, name: string, exceptId?: number): Promise<boolean> {
  const sameName = sql`lower(${warehouses.name}) = lower(${name})`;
  const [row] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(exceptId ? and(sameName, ne(warehouses.id, exceptId)) : sameName);
  return !!row;
}

export async function nextWarehouseSortOrder(db: any): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`(coalesce(max(${warehouses.sortOrder}), 0) + 10)::int` })
    .from(warehouses);
  return row?.next ?? 10;
}
