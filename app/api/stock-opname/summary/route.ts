import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { k3StockImportSessions, k3StockImports, k3StockLines, locationStock, locations, users } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
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

type K3ImportSummary = {
  date: string;
  fileName: string | null;
  importedAt: string;
  by: string | null;
  goodStockRows: number;
  matchedSkus: number;
  totalQuantity: number;
  unmatched: { code: string; name: string | null; quantity: number }[];
  sessions: string[]; // the SOSKU sessions using it
};

// GET /api/stock-opname/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&warehouseId=N
// The Stock Opname Summary tab: every product, and for each day it had a
// per-SKU (SOSKU-) opname, the system and counted (SO) quantity per Total
// Stock column of the warehouse (lib/skuOpnameSummary.ts). Every session
// is returned: when a SKU was opnamed more than once on a day, that day has
// one entry per SOSKU session, oldest first (the tab shows one sub-row each).
// currentStock is the product's live Total Stock in the warehouse right now
// (same rule as the Total Stock page: locations ticked "Counts in Total
// Stock"), independent of the date filter.
// K3 (main system) Good Stock is imported per SOSKU session (each PIC pulls
// their own file — POST /api/stock-opname/summary/k3): k3Sessions maps a
// session to its import, k3Imports describes each import, and
// items[].k3[importId] is the product's quantity in it — missing means it
// wasn't in the file (0 in K3). A session with no import has no K3 figures.
//   {
//     warehouse: { id, name }, warehouses: [{ id, name, isActive }],
//     buckets: [{ key, name }],      // "col:<id>" per column, "other", "total"
//     dates: ["2026-10-20", ...],    // oldest first
//     items: [{ itemId, sku, name, currentStock, cells: { [date]: [{ opnameNumber,
//               lockedAt, status, by, buckets: { [key]: { system, counted } },
//               unaccounted, adjustment }, ...] }, k3: { [importId]: qty } }],
//     k3Sessions: { [opnameNumber]: importId },
//     k3Imports: { [importId]: { date, fileName, importedAt, by, goodStockRows,
//               matchedSkus, totalQuantity, unmatched: [{ code, name, quantity }],
//               sessions: [opnameNumber] } }
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

  // K3 imports of the sessions shown, and their lines.
  const opnameNumbers = [...new Set(entries.map((e) => e.opnameNumber))];
  const links =
    opnameNumbers.length === 0
      ? []
      : await db
          .select({ importId: k3StockImportSessions.importId, opnameNumber: k3StockImportSessions.opnameNumber })
          .from(k3StockImportSessions)
          .where(inArray(k3StockImportSessions.opnameNumber, opnameNumbers));
  const importIds = [...new Set(links.map((l) => l.importId))];
  const [imports, k3Lines] =
    importIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              id: k3StockImports.id,
              date: k3StockImports.stockDate,
              fileName: k3StockImports.fileName,
              goodStockRows: k3StockImports.goodStockRows,
              unmatched: k3StockImports.unmatched,
              importedAt: sql<string>`to_char(${k3StockImports.importedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`,
              by: users.username,
            })
            .from(k3StockImports)
            .leftJoin(users, eq(users.id, k3StockImports.importedBy))
            .where(inArray(k3StockImports.id, importIds)),
          db
            .select({ importId: k3StockLines.importId, itemId: k3StockLines.itemId, quantity: k3StockLines.quantity })
            .from(k3StockLines)
            .where(inArray(k3StockLines.importId, importIds)),
        ]);

  const k3Sessions: Record<string, number> = {};
  for (const l of links) k3Sessions[l.opnameNumber] = l.importId;
  const k3Imports: Record<number, K3ImportSummary> = {};
  for (const imp of imports) {
    k3Imports[imp.id] = {
      date: imp.date,
      fileName: imp.fileName,
      importedAt: imp.importedAt,
      by: imp.by,
      goodStockRows: imp.goodStockRows,
      matchedSkus: 0,
      totalQuantity: 0,
      unmatched: imp.unmatched,
      sessions: links.filter((l) => l.importId === imp.id).map((l) => l.opnameNumber).sort(),
    };
  }
  const k3ByItem = new Map<number, Record<number, number>>();
  for (const line of k3Lines) {
    const byImport = k3ByItem.get(line.itemId) ?? {};
    byImport[line.importId] = line.quantity;
    k3ByItem.set(line.itemId, byImport);
    const meta = k3Imports[line.importId];
    meta.matchedSkus++;
    meta.totalQuantity = Math.round((meta.totalQuantity + line.quantity) * 1000) / 1000;
  }

  return NextResponse.json({
    warehouse: { id: warehouse.id, name: warehouse.name },
    warehouses: warehouses.map(({ id, name, isActive }) => ({ id, name, isActive })),
    buckets,
    dates,
    k3Sessions,
    k3Imports,
    items: products.map((p) => ({
      ...p,
      currentStock: stockByItem.get(p.itemId) ?? 0,
      cells: cells.get(p.itemId) ?? {},
      k3: k3ByItem.get(p.itemId) ?? {},
    })),
  });
}