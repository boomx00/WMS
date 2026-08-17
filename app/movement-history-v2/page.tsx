import { db } from "@/lib/db";
import { locationStockEvents, items, locations, users, salesOrders } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import MovementHistoryV2Table from "./MovementHistoryV2Table";

export const dynamic = "force-dynamic";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

async function getEvents() {
  return db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      itemSku: items.sku,
      itemName: items.name,
      sourceCode: sourceLoc.code,
      destinationCode: destLoc.code,
      soNumber: salesOrders.soNumber,
      quantity: locationStockEvents.quantity,
      username: users.username,
      createdAt: locationStockEvents.createdAt,
    })
    .from(locationStockEvents)
    .innerJoin(items, eq(locationStockEvents.itemId, items.id))
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .orderBy(desc(locationStockEvents.createdAt))
    .limit(200);
}

export default async function MovementHistoryV2Page() {
  const rows = await getEvents();

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Movement History (v2)</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Location-based picking and shipping activity — separate from the
          pallet-level history on the main History page.
        </p>
      </header>

      <MovementHistoryV2Table rows={rows} />
    </div>
  );
}