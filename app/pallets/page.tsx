import { db } from "@/lib/db";
import { pallets, items, locations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import PalletsTable from "./PalletsTable";

export const dynamic = "force-dynamic";

// Three separate aliases for `users`, since the same table is joined three
// times — once per role in the pallet's lifecycle.
const inboundUser = alias(users, "inbound_user");
const inForkliftUser = alias(users, "in_forklift_user");
const outForkliftUser = alias(users, "out_forklift_user");

async function getPallets() {
  return db
    .select({
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      workOrderNumber: pallets.workOrderNumber,
      status: pallets.status,
      itemSku: items.sku,
      itemName: items.name,
      currentLocationCode: locations.code,
      currentLocationType: locations.type,
      inboundAt: pallets.inboundAt,
      firstRackedAt: pallets.firstRackedAt,
      removedAt: pallets.removedAt,
      inboundByUsername: inboundUser.username,
      rackedByUsername: inForkliftUser.username,
      removedByUsername: outForkliftUser.username,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .innerJoin(inboundUser, eq(pallets.inboundUserId, inboundUser.id))
    .leftJoin(inForkliftUser, eq(pallets.inForkliftUserId, inForkliftUser.id))
    .leftJoin(outForkliftUser, eq(pallets.outForkliftUserId, outForkliftUser.id));
}

export default async function PalletsPage() {
  const rows = await getPallets();

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Pallets</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Full lifecycle per pallet — when it came in, when it was racked,
          when it left, and who did each step.
        </p>
      </header>

      <PalletsTable rows={rows} />
    </div>
  );
}