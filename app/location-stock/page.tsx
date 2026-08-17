import { db } from "@/lib/db";
import { locationStock, locations, items } from "@/db/schema";
import { eq, or, ne } from "drizzle-orm";
import LocationStockTable from "./LocationStockTable"

export const dynamic = "force-dynamic";

async function getLocationStock() {
  return db
    .select({
      id: locationStock.id,
      locationCode: locations.code,
      locationType: locations.type,
      itemSku: items.sku,
      itemName: items.name,
      quantity: locationStock.quantity,
      updatedAt: locationStock.updatedAt,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(or(eq(locations.type, "FLOOR"), ne(locationStock.quantity, 0)))
    .orderBy(locations.code);
}

export default async function LocationStockPage() {
  const rows = await getLocationStock();

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Location Stock</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Live per-location totals (v2) — direct read of the location_stock
          table, not derived from pallets.
        </p>
      </header>

      <LocationStockTable rows={rows} />
    </div>
  );
}