import { db } from "@/lib/db";
import { locationStock, locations, locationTypes, items } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { getStockColumns } from "@/lib/stockColumns";
import { getWarehouses, pickDefaultWarehouse } from "@/lib/warehouses";
import TotalStockTable, { type SkuStock } from "./TotalStockTable";

export const dynamic = "force-dynamic";

// One warehouse's Total Stock (its tab). Only its locations ticked "Counts
// toward Total Stock" on the Locations page are part of it. Within each
// SKU, locations are listed in their type's display order (Floor, Outbound
// WH, Rack, ...), then by code.
async function getTotalStock(warehouseId: number): Promise<SkuStock[]> {
  const rows = await db
    .select({
      itemId: items.id,
      itemSku: items.sku,
      itemName: items.name,
      palletCartonQty: items.palletCartonQty,
      locationCode: locations.code,
      locationType: locations.type,
      locationArea: locations.area,
      stockColumnId: locations.stockColumnId,
      typeOrder: locationTypes.sortOrder,
      quantity: locationStock.quantity,
      // Formatted in SQL (24-hour, UTC) so the browser can't shift the timezone
      updatedAt: sql<string>`to_char(${locationStock.updatedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`,    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(
      and(
        ne(locationStock.quantity, 0),
        eq(locations.countsInTotalStock, true),
        eq(locations.warehouseId, warehouseId)
      )
    )
    .orderBy(items.sku);

  const byItem = new Map<number, SkuStock>();
  const typeOrderByCode = new Map<string, number>();

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

    typeOrderByCode.set(row.locationCode, row.typeOrder);
    entry.totalQuantity += row.quantity;
    entry.locations.push({
      locationCode: row.locationCode,
      locationType: row.locationType,
      locationArea: row.locationArea,
      stockColumnId: row.stockColumnId,
      quantity: row.quantity,
      updatedAt: row.updatedAt,
    });
  }

  const result = Array.from(byItem.values());
  for (const entry of result) {
    entry.locations.sort(
      (a, b) =>
        (typeOrderByCode.get(a.locationCode) ?? 0) - (typeOrderByCode.get(b.locationCode) ?? 0) ||
        a.locationCode.localeCompare(b.locationCode, undefined, { numeric: true })
    );
  }

  return result;
}

// One tab per warehouse (?warehouse=<id>), inactive ones included so their
// stock stays visible; the default (first active) warehouse when none (or
// an unknown one) is chosen.
export default async function TotalStockPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string | string[] }>;
}) {
  const { warehouse: warehouseParam } = await searchParams;
  const warehouses = await getWarehouses(db);
  const requested = Number(Array.isArray(warehouseParam) ? warehouseParam[0] : warehouseParam);
  const active = warehouses.find((w) => w.id === requested) ?? pickDefaultWarehouse(warehouses);

  const [skus, columns] = active
    ? await Promise.all([getTotalStock(active.id), getStockColumns(db, active.id)])
    : [[], []];

  return (
    <div className="p-8">
      <TotalStockTable
        // Fresh sort / search / expanded rows per tab.
        key={active?.id ?? "none"}
        skus={skus}
        columns={columns.map(({ id, name }) => ({ id, name }))}
        warehouses={warehouses.map(({ id, name, isActive }) => ({ id, name, isActive }))}
        activeWarehouseId={active?.id ?? null}
      />
    </div>
  );
}
