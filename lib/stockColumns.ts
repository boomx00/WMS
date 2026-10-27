// Server-only: the Total Stock columns managed on Settings → Total Stock
// Columns (stock_columns table). Each warehouse has its own columns (its
// Total Stock tab); each location picks one of its warehouse's columns as
// "Shown under" on the Locations page, or none (counted in the total only).
//
// Functions that take an optional warehouseId cover every warehouse when
// it's left out.

import { locations, stockColumns } from "@/db/schema";
import { and, asc, eq, ne, sql, type SQL } from "drizzle-orm";

export type StockColumn = {
  id: number;
  warehouseId: number;
  name: string;
  nameId: string | null; // Indonesian name (null = use name)
  nameZh: string | null; // Chinese name (null = use name)
  sortOrder: number;
};
export type StockColumnListRow = StockColumn & { locationCount: number };

const inWarehouse = (warehouseId?: number | null): SQL | undefined =>
  warehouseId ? eq(stockColumns.warehouseId, warehouseId) : undefined;

// Columns in display order (one warehouse's, or all).
export async function getStockColumns(db: any, warehouseId?: number | null): Promise<StockColumn[]> {
  return db
    .select({
      id: stockColumns.id,
      warehouseId: stockColumns.warehouseId,
      name: stockColumns.name,
      nameId: stockColumns.nameId,
      nameZh: stockColumns.nameZh,
      sortOrder: stockColumns.sortOrder,
    })
    .from(stockColumns)
    .where(inWarehouse(warehouseId))
    .orderBy(asc(stockColumns.sortOrder), asc(stockColumns.id));
}

// Same, with how many locations show under each one.
export async function listStockColumnsWithCounts(db: any, warehouseId?: number | null): Promise<StockColumnListRow[]> {
  return db
    .select({
      id: stockColumns.id,
      warehouseId: stockColumns.warehouseId,
      name: stockColumns.name,
      nameId: stockColumns.nameId,
      nameZh: stockColumns.nameZh,
      sortOrder: stockColumns.sortOrder,
      locationCount: sql<number>`count(${locations.id})::int`,
    })
    .from(stockColumns)
    .leftJoin(locations, eq(locations.stockColumnId, stockColumns.id))
    .where(inWarehouse(warehouseId))
    .groupBy(stockColumns.id)
    .orderBy(asc(stockColumns.sortOrder), asc(stockColumns.id));
}

export async function getStockColumnById(db: any, id: number): Promise<StockColumn | null> {
  const [row] = await db
    .select({
      id: stockColumns.id,
      warehouseId: stockColumns.warehouseId,
      name: stockColumns.name,
      nameId: stockColumns.nameId,
      nameZh: stockColumns.nameZh,
      sortOrder: stockColumns.sortOrder,
    })
    .from(stockColumns)
    .where(eq(stockColumns.id, id))
    .limit(1);
  return row ?? null;
}

export function cleanColumnName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim() : "";
}

// An optional translated name: trimmed, or null when left empty.
export function cleanColumnTranslation(value: unknown): string | null {
  return cleanColumnName(value) || null;
}

// Case-insensitive and per warehouse, so "good stock" and "Good Stock"
// can't both exist in one tab (but each tab can have its own).
export async function columnNameTaken(db: any, warehouseId: number, name: string, exceptId?: number): Promise<boolean> {
  const conditions: SQL[] = [eq(stockColumns.warehouseId, warehouseId), sql`lower(${stockColumns.name}) = lower(${name})`];
  if (exceptId) conditions.push(ne(stockColumns.id, exceptId));
  const [row] = await db
    .select({ id: stockColumns.id })
    .from(stockColumns)
    .where(and(...conditions));
  return !!row;
}

export async function nextColumnSortOrder(db: any, warehouseId: number): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`(coalesce(max(${stockColumns.sortOrder}), 0) + 10)::int` })
    .from(stockColumns)
    .where(eq(stockColumns.warehouseId, warehouseId));
  return row?.next ?? 10;
}

// Codes of the locations currently shown under a column.
export async function locationsUsingColumn(db: any, columnId: number): Promise<string[]> {
  const rows: { code: string }[] = await db
    .select({ code: locations.code })
    .from(locations)
    .where(eq(locations.stockColumnId, columnId))
    .orderBy(asc(locations.code));
  return rows.map((r) => r.code);
}
