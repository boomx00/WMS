import { db } from "@/lib/db";
import { palletEvents, pallets, items, locations, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import MovementTable from "./MovementTable";
import MovementSummary from "./MovementSummary";

export const dynamic = "force-dynamic";

async function getMovementHistory() {
  return db
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
    .orderBy(desc(palletEvents.createdAt))
    .limit(500);
}

export default async function TransactionsPage() {
  const rows = await getMovementHistory();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Movement History</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Every inbound, move, and removal scan — most recent first.
        </p>
      </header>
<MovementSummary />
<MovementTable rows={rows} />
      {/* <MovementTable rows={rows} /> */}
    </div>
  );
}