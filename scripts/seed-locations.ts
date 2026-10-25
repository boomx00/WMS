import { config } from "dotenv";
config({ path: ".env.local" });

const AREA_WIDTHS: Record<string, number> = {
  A: 13,
  B: 16,
  C: 15,
  D: 16,
  E: 15,
  F: 16,
  G: 15,
  H: 16,
};

async function main() {
  const { db } = await import("../lib/db");
  const { locations, locationTypes, stockColumns, warehouses } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  // Location types must exist before any location can use them
  // (locations.type references location_types.code). Same defaults as
  // scripts/migration-location-types.sql.
  console.log("Seeding location types...");

  await db
    .insert(locationTypes)
    .values([
      { code: "FLOOR", name: "Floor", allowsMultipleSku: true, hasPosition: false, pickable: true, sortOrder: 10 },
      { code: "OUTBOUND_WH", name: "Outbound WH", allowsMultipleSku: true, hasPosition: false, pickable: false, sortOrder: 20 },
      { code: "RACK", name: "Rack", allowsMultipleSku: false, hasPosition: true, pickable: true, maxPallets: 14, sortOrder: 30 },
      { code: "DESTROY", name: "Destroy", allowsMultipleSku: true, hasPosition: false, pickable: false, sortOrder: 40 },
      { code: "LEFTOVER", name: "Leftover", allowsMultipleSku: true, hasPosition: false, pickable: false, sortOrder: 50 },
    ])
    .onConflictDoNothing({ target: locationTypes.code });

  // Every location belongs to a warehouse (parent location); these all go
  // to Finished Goods, same as the migration.
  console.log("Seeding warehouse...");

  await db
    .insert(warehouses)
    .values({ name: "Finished Goods", sortOrder: 10 })
    .onConflictDoNothing({ target: warehouses.name });
  const [finishedGoods] = await db.select().from(warehouses).where(eq(warehouses.name, "Finished Goods"));
  const warehouseId = finishedGoods.id;

  // Total Stock columns (Finished Goods tab), same defaults as the migration.
  console.log("Seeding Total Stock columns...");

  await db
    .insert(stockColumns)
    .values([
      { warehouseId, name: "Export", sortOrder: 10 },
      { warehouseId, name: "Defect", sortOrder: 20 },
      { warehouseId, name: "Good Stock", sortOrder: 30 },
      { warehouseId, name: "Outbound WH", sortOrder: 40 },
    ])
    .onConflictDoNothing({ target: [stockColumns.warehouseId, stockColumns.name] });

  const columns = await db.select().from(stockColumns).where(eq(stockColumns.warehouseId, warehouseId));
  const columnId = (name: string) => columns.find((c) => c.name === name)?.id ?? null;
  const goodStock = columnId("Good Stock");

  console.log("Seeding rack locations...");

  const rackRows = Object.entries(AREA_WIDTHS).flatMap(([area, maxX]) => {
    const rows = [];
    for (let x = 1; x <= maxX; x++) {
      for (let y = 1; y <= 5; y++) {
        rows.push({
          code: `${area}.${x}.${y}`,
          type: "RACK",
          warehouseId,
          stockColumnId: goodStock,
          area,
          x,
          y,
        });
      }
    }
    return rows;
  });

  console.log(`Generated ${rackRows.length} rack locations.`);

  await db.insert(locations).values(rackRows).onConflictDoNothing({
    target: locations.code,
  });

  await db
    .insert(locations)
    .values([
      { code: "FLOOR", type: "FLOOR", warehouseId, isReceiving: true, stockColumnId: goodStock },
      { code: "DESTROY", type: "DESTROY", warehouseId },
      { code: "LEFTOVER", type: "LEFTOVER", warehouseId },
      { code: "OUTBOUND_WH", type: "OUTBOUND_WH", warehouseId, isStaging: true, stockColumnId: columnId("Outbound WH") },
    ])
    .onConflictDoNothing({ target: locations.code });

  // The PDA pickers' defaults for Finished Goods: FLOOR / OUTBOUND_WH.
  const [floor] = await db.select().from(locations).where(eq(locations.code, "FLOOR"));
  const [outboundWh] = await db.select().from(locations).where(eq(locations.code, "OUTBOUND_WH"));
  if (!finishedGoods.defaultReceivingLocationId || !finishedGoods.defaultStagingLocationId) {
    await db
      .update(warehouses)
      .set({
        defaultReceivingLocationId: finishedGoods.defaultReceivingLocationId ?? floor?.id ?? null,
        defaultStagingLocationId: finishedGoods.defaultStagingLocationId ?? outboundWh?.id ?? null,
      })
      .where(eq(warehouses.id, warehouseId));
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
