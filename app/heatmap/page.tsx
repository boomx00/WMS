import { db } from "@/lib/db";
import { pallets, items, locations } from "@/db/schema";
import { eq, ne } from "drizzle-orm";
import WarehouseMap from "@/components/WarehouseMap";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

async function getActiveInventory() {
  return db
    .select({
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      workOrderNumber: pallets.workOrderNumber,
      updatedAt: pallets.updatedAt,
      itemSku: items.sku,
      itemName: items.name,
      locationCode: locations.code,
      locationType: locations.type,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .where(eq(pallets.status, "ACTIVE"))
    .orderBy(locations.code);
}

export default async function InventoryPage() {
  const rows = await getActiveInventory();

  const totalPallets = rows.length;
  const totalUnits = rows.reduce((sum, r) => sum + r.quantity, 0);
  const onFloor = rows.filter((r) => r.locationType === "FLOOR").length;
  const onRack = rows.filter((r) => r.locationType === "RACK").length;

  return (
    <InventoryClient
      totalPallets={totalPallets}
      totalUnits={totalUnits}
      onFloor={onFloor}
      onRack={onRack}
      map={<WarehouseMap />}
    />
  );
}