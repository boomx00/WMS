import { db } from "@/lib/db";
import { locationStock, locations, items } from "@/db/schema";
import { eq, ne, sql } from "drizzle-orm";
import TotalStockTable, { type SkuStock } from "./TotalStockTable";

export const dynamic = "force-dynamic";

// Floor and Outbound WH first, then racks, then the remaining special types.
const TYPE_ORDER = ["FLOOR", "OUTBOUND_WH", "RACK", "DESTROY", "LEFTOVER"];

function typeRank(type: string): number {
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
}

async function getTotalStock(): Promise<SkuStock[]> {
  const rows = await db
    .select({
      itemId: items.id,
      itemSku: items.sku,
      itemName: items.name,
      palletCartonQty: items.palletCartonQty,
      locationCode: locations.code,
      locationType: locations.type,
      locationArea: locations.area,
      quantity: locationStock.quantity,
      // Formatted in SQL (24-hour, UTC) so the browser can't shift the timezone
      updatedAt: sql<string>`to_char(${locationStock.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(ne(locationStock.quantity, 0))
    .orderBy(items.sku);

  const byItem = new Map<number, SkuStock>();

  for (const row of rows) {
    let entry = byItem.get(row.itemId);
    if (!entry) {
      entry = {
        itemId: row.itemId,
        sku: row.itemSku,
        name: row.itemName,
        palletCartonQty: Number(row.palletCartonQty) || 0,
        totalQuantity: 0,
        locations: [],
      };
      byItem.set(row.itemId, entry);
    }

    entry.totalQuantity += row.quantity;
    entry.locations.push({
      locationCode: row.locationCode,
      locationType: row.locationType,
      locationArea: row.locationArea,
      quantity: row.quantity,
      updatedAt: row.updatedAt,
    });
  }

  const result = Array.from(byItem.values());
  for (const entry of result) {
    entry.locations.sort(
      (a, b) =>
        typeRank(a.locationType) - typeRank(b.locationType) ||
        a.locationCode.localeCompare(b.locationCode, undefined, { numeric: true })
    );
  }

  return result;
}

export default async function TotalStockPage() {
  const skus = await getTotalStock();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Total Stock</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Total stock per SKU across all locations (v2). Click a row to see
          where the stock is.
        </p>
      </header>

      <TotalStockTable skus={skus} />
    </div>
  );
}