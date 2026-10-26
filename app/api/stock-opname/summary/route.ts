import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getWarehouses, resolveWarehouse } from "@/lib/warehouses";
import {
  cleanDate,
  getSkuOpnameEntries,
  getSummaryBuckets,
  getSummaryItems,
  type SummaryEntry,
} from "@/lib/skuOpnameSummary";

export const dynamic = "force-dynamic";

// GET /api/stock-opname/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&warehouseId=N
// The Stock Opname Summary tab: every product, and for each day it had a
// per-SKU (SOSKU-) opname, the system and counted (SO) quantity per Total
// Stock column of the warehouse (lib/skuOpnameSummary.ts). Every session
// is returned: when a SKU was opnamed more than once on a day, that day has
// one entry per SOSKU session, oldest first (the tab shows one sub-row each).
// currentStock is the product's live Total Stock in the warehouse right now
// (same rule as the Total Stock page: locations ticked "Counts in Total
// Stock"), independent of the date filter.
//   {
//     warehouse: { id, name }, warehouses: [{ id, name, isActive }],
//     buckets: [{ key, name }],      // "col:<id>" per column, "other", "total"
//     dates: ["2026-10-20", ...],    // oldest first
//     items: [{ itemId, sku, name, currentStock, cells: { [date]: [{ opnameNumber,
//               lockedAt, status, by, buckets: { [key]: { system, counted } },
//               unaccounted, adjustment }, ...] } }]
//   }
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const resolved = await resolveWarehouse(db, params.get("warehouseId"));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { warehouse } = resolved;
  const from = cleanDate(params.get("from"));
  const to = cleanDate(params.get("to"));

  const [entries, buckets, products, warehouses, stockRows] = await Promise.all([
    getSkuOpnameEntries(db, { warehouseId: warehouse.id, from, to }),
    getSummaryBuckets(db, warehouse.id),
    getSummaryItems(db),
    getWarehouses(db),
    db
      .select({
        itemId: locationStock.itemId,
        quantity: sql<number>`coalesce(sum(${locationStock.quantity}), 0)::int`,
      })
      .from(locationStock)
      .innerJoin(locations, eq(locationStock.locationId, locations.id))
      .where(and(eq(locations.countsInTotalStock, true), eq(locations.warehouseId, warehouse.id)))
      .groupBy(locationStock.itemId),
  ]);

  const stockByItem = new Map(stockRows.map((r) => [r.itemId, r.quantity]));

  // Every opname per product per day (entries come oldest first, so each
  // day's list is oldest first too).
  const cells = new Map<number, Record<string, SummaryEntry[]>>();
  for (const entry of entries) {
    const byDate = cells.get(entry.itemId) ?? {};
    (byDate[entry.date] ??= []).push(entry);
    cells.set(entry.itemId, byDate);
  }

  const dates = [...new Set(entries.map((e) => e.date))].sort();

  return NextResponse.json({
    warehouse: { id: warehouse.id, name: warehouse.name },
    warehouses: warehouses.map(({ id, name, isActive }) => ({ id, name, isActive })),
    buckets,
    dates,
    items: products.map((p) => ({
      ...p,
      currentStock: stockByItem.get(p.itemId) ?? 0,
      cells: cells.get(p.itemId) ?? {},
    })),
  });
}