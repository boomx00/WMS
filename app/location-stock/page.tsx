import { db } from "@/lib/db";
import { locationStock, locations, locationTypes, items, productCategories } from "@/db/schema";
import { locationStockUnitFields, lsPrimaryUnit, lsSecondaryUnit, lsStorageUnit } from "@/lib/units";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { getWarehouses } from "@/lib/warehouses";
import { getUnits } from "@/lib/units";
import { getResolvedLocationStockCards } from "@/lib/locationStockCards";
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
      // Loose packs ("Counted in packs" locations only; quantity is 0 there).
      loosePacks: locationStock.loosePacks,
      countsInPacks: locationTypes.countsInPacks,
      // The product's units (its category) — lib/locationStockUnits.ts.
      ...locationStockUnitFields,

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
    .leftJoin(productCategories, eq(items.categoryId, productCategories.id))
    .leftJoin(lsPrimaryUnit, eq(productCategories.primaryUnitId, lsPrimaryUnit.id))
    .leftJoin(lsSecondaryUnit, eq(productCategories.secondaryUnitId, lsSecondaryUnit.id))
    .leftJoin(lsStorageUnit, eq(productCategories.storageUnitId, lsStorageUnit.id))
    .where(
      or(
        and(eq(locationTypes.pickable, true), eq(locationTypes.hasPosition, false)),
        ne(locationStock.quantity, 0),
        ne(locationStock.loosePacks, 0)
      )
    )
    .orderBy(locations.code);
}

export default async function LocationStockPage() {
  const [rows, warehouses, cards, allUnits] = await Promise.all([
    getLocationStock(),
    getWarehouses(db),
    getResolvedLocationStockCards(db),
    getUnits(db),
  ]);

  return (
    <div className="p-8 max-w-4xl">


      <LocationStockTable
        rows={rows}
        warehouses={warehouses.map(({ id, name, isActive }) => ({ id, name, isActive }))}
        // Settings → Location Stock Cards
        cards={cards}
        allUnits={allUnits.map(({ id, code, name, nameId, nameZh, decimals }) => ({ id, code, name, nameId, nameZh, decimals }))}
      />
    </div>
  );
}
