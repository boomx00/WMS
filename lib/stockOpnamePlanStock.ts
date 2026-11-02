// Server-only: the WMS data the stock opname plan works from — the live Good
// Stock of one warehouse (locations "Shown under" its Good Stock column on
// the Locations page), each item's legacy SKU so plan codes that use it still
// match, and the SKUs already opnamed (locked in a SOSKU session).

import { items, locations, locationStock, stockColumns, stockOpnameSkus } from "@/db/schema";
import { and, eq, gte, isNotNull, like, lte, sql } from "drizzle-orm";
import { SKU_OPNAME_PREFIX } from "@/lib/skuOpname";
import type { CountedSku, StockRow } from "@/lib/stockOpnamePlan";

const GOOD_STOCK_COLUMN = "good stock";

export async function getGoodStock(
  db: any,
  warehouseId: number
): Promise<{ stock: StockRow[]; skuAliases: Record<string, string> }> {
  const [column]: { id: number }[] = await db
    .select({ id: stockColumns.id })
    .from(stockColumns)
    .where(
      and(
        eq(stockColumns.warehouseId, warehouseId),
        sql`lower(trim(${stockColumns.name})) = ${GOOD_STOCK_COLUMN}`
      )
    )
    .limit(1);
  if (!column) throw new Error(`This warehouse has no "Good Stock" column (Settings → Total Stock Columns)`);

  const [stock, legacyRows]: [StockRow[], { legacySku: string; sku: string }[]] = await Promise.all([
    db
      .select({
        sku: items.sku,
        name: items.name,
        qty: sql<number>`sum(${locationStock.quantity})::int`,
      })
      .from(locationStock)
      .innerJoin(locations, eq(locationStock.locationId, locations.id))
      .innerJoin(items, eq(locationStock.itemId, items.id))
      .where(
        and(
          eq(locations.warehouseId, warehouseId),
          eq(locations.stockColumnId, column.id),
          eq(locations.countsInTotalStock, true)
        )
      )
      .groupBy(items.sku, items.name)
      .having(sql`sum(${locationStock.quantity}) > 0`),
    db
      .select({ legacySku: sql<string>`${items.legacySku}`, sku: items.sku })
      .from(items)
      .where(isNotNull(items.legacySku)),
  ]);

  const skuAliases: Record<string, string> = {};
  for (const row of legacyRows) skuAliases[row.legacySku] = row.sku;

  return { stock, skuAliases };
}

// SKUs locked in a SOSKU session between two dates (YYYY-MM-DD, inclusive,
// Asia/Jakarta), whatever the session's status, so a count that has started
// isn't planned again.
export async function getOpnamedSkus(db: any, from: string, to: string): Promise<CountedSku[]> {
  const addedDate = sql<string>`to_char(${stockOpnameSkus.addedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
  return db
    .select({ sku: items.sku, date: addedDate })
    .from(stockOpnameSkus)
    .innerJoin(items, eq(stockOpnameSkus.itemId, items.id))
    .where(and(like(stockOpnameSkus.opnameNumber, `${SKU_OPNAME_PREFIX}%`), gte(addedDate, from), lte(addedDate, to)));
}
