import { db } from "@/lib/db";
import { pallets, items, locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import PendingTable from "./PendingTable";

export const dynamic = "force-dynamic";

async function getPendingPallets() {
  return db
    .select({
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      workOrderNumber: pallets.workOrderNumber,
      itemSku: items.sku,
      itemName: items.name,
      intendedLocationCode: locations.code,
      createdAt: pallets.createdAt,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .where(eq(pallets.status, "PENDING"));
}

export default async function PendingPage() {
  const rows = await getPendingPallets();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Pending Confirmation</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Split-off pallets waiting for an operator to scan them in. Not yet
          counted as active stock.
        </p>
      </header>

      <PendingTable rows={rows} />
    </div>
  );
}