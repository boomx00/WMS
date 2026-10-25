import { db } from "@/lib/db";
import { locationStock, locations, locationTypes, items } from "@/db/schema";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { getWarehouses } from "@/lib/warehouses";
import LocationStockTable from "./LocationStockTable";

export const dynamic = "force-dynamic";

// Zero-quantity rows are hidden, except in open pick areas (pickable
// locations without a rack position — today the FLOOR type), where they
// stay visible.
async function getLocationStock() {
  return db
    .select({
      id: locationStock.id,
      locationCode: locations.code,
      locationType: locations.type,
      locationArea: locations.area,
      isStaging: locations.isStaging,
      warehouseId: locations.warehouseId,
      typeName: locationTypes.name,
      typeOrder: locationTypes.sortOrder,
      hasPosition: locationTypes.hasPosition,
      pickable: locationTypes.pickable,
      itemSku: items.sku,
      itemName: items.name,
      quantity: locationStock.quantity,

      // Calculate pallet quantity
      palletQuantity: sql<number>`
        ROUND(
          ${locationStock.quantity}::numeric / NULLIF(${items.palletCartonQty}, 0),
          2
        )
      `,
      updatedAt: locationStock.updatedAt,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(
      or(
        and(eq(locationTypes.pickable, true), eq(locationTypes.hasPosition, false)),
        ne(locationStock.quantity, 0)
      )
    )
    .orderBy(locations.code);
}

export default async function LocationStockPage() {
  const [rows, warehouses] = await Promise.all([getLocationStock(), getWarehouses(db)]);

  return (
    <div className="p-8 max-w-4xl">


      <LocationStockTable rows={rows} warehouses={warehouses.map(({ id, name, isActive }) => ({ id, name, isActive }))} />
    </div>
  );
}
