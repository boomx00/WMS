import { db } from "@/lib/db";
import { palletEvents, pallets, items, locations, users } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import MovementTable from "./MovementTable";

export const dynamic = "force-dynamic";

async function getInboundEvents() {
  const rows = await db
    .select({
      eventId: palletEvents.id,
      type: palletEvents.type,
      createdAt: palletEvents.createdAt,
      locationCode: locations.code,
      palletLabel: pallets.label,
      workOrderNumber: pallets.workOrderNumber,
      quantity: palletEvents.quantity,
      itemSku: items.sku,
      itemName: items.name,
      username: users.username,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(palletEvents.locationId, locations.id))
    .innerJoin(users, eq(palletEvents.userId, users.id))
    .where(inArray(palletEvents.type, ["INBOUND", "DEFAULT_INBOUND"]))    
    .orderBy(desc(palletEvents.createdAt))
    .limit(100);

  return rows;
}

export default async function TransactionsPage() {
  const rows = await getInboundEvents();

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Every pallet that has entered the warehouse — regular Inbound
          scans and auto-discovered pre-existing stock alike.
        </p>
      </header>

      <MovementTable rows={rows} />
    </div>
  );
}