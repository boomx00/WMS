import { config } from "dotenv";
config({ path: ".env.local" });

// One-off HARD RESET: for every item currently sitting in Outbound WH,
// forces Unmarked to exactly (Total − sum of marked-to-still-OPEN SOs),
// so the equation Total = Unmarked + Marked holds exactly, by
// construction, for every single SKU.
//
// This trusts two things as ground truth: the physical location_stock
// total (never touched by any SO-tagging logic, so it's reliable), and
// whatever's currently marked to still-OPEN sales orders (recent,
// active claims — left completely untouched). Everything else — all
// accumulated historical drift from past bugs — gets absorbed into a
// single corrective event per SKU that resets Unmarked to the exact
// value needed to balance the books.
//
// Completed SOs are ignored entirely here (their marked amounts should
// already be 0 after the earlier reconciliation pass, and don't factor
// into this calculation either way since only OPEN SOs are summed).
async function main() {
  const { db } = await import("../lib/db");
  const { items, locations, locationStock, salesOrders, salesOrderItems, locationStockEvents } =
    await import("../db/schema");
  const { eq, and, isNotNull } = await import("drizzle-orm");
  const { getPickedForSoQuantity } = await import("../lib/pickedForSo");
  const { getShippedQuantity } = await import("../lib/shippedQuantity");
  const { getUnclaimedQuantity } = await import("../lib/unclaimedStock");

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    console.error("No OUTBOUND_WH location found.");
    process.exit(1);
  }

  const { users } = await import("../db/schema");
  const [systemUser] = await db.select().from(users).limit(1);
  if (!systemUser) {
    console.error("No users found — can't attribute this action.");
    process.exit(1);
  }

  const stockRows = await db
    .select({ itemId: locationStock.itemId, quantity: locationStock.quantity })
    .from(locationStock)
    .where(eq(locationStock.locationId, outboundWh.id));

  console.log(`Checking ${stockRows.length} item(s) currently in Outbound WH...`);

  let correctedCount = 0;
  let skippedCount = 0;

  for (const stock of stockRows) {
    const total = stock.quantity;

    // Every distinct SO that's ever touched this item.
    const soRows = await db
      .selectDistinct({ salesOrderId: locationStockEvents.salesOrderId })
      .from(locationStockEvents)
      .where(
        and(eq(locationStockEvents.itemId, stock.itemId), isNotNull(locationStockEvents.salesOrderId))
      );

    let markedToOpenSos = 0;
    for (const row of soRows) {
      if (row.salesOrderId === null) continue;

      const [orderLine] = await db
        .select()
        .from(salesOrderItems)
        .where(
          and(
            eq(salesOrderItems.salesOrderId, row.salesOrderId),
            eq(salesOrderItems.itemId, stock.itemId)
          )
        );
      if (!orderLine) continue;

      const shipped = await getShippedQuantity(db, row.salesOrderId, stock.itemId);
      const isOpen = shipped < orderLine.quantity;
      if (!isOpen) continue;

      const netMarked = Math.max(0, await getPickedForSoQuantity(db, row.salesOrderId, stock.itemId));
      markedToOpenSos += netMarked;
    }

    const desiredUnmarked = Math.max(0, total - markedToOpenSos);
    const currentUnmarked = await getUnclaimedQuantity(db, stock.itemId);
    const delta = desiredUnmarked - currentUnmarked;

    if (delta === 0) {
      skippedCount++;
      continue;
    }

    // A single untagged PICKING correction event nudges the unmarked
    // pool by exactly `delta` — this lands directly in
    // getUnclaimedQuantity's "untaggedPicked" sum, which is unconditional
    // and correctly handles either a positive or negative delta.
    await db.insert(locationStockEvents).values({
      type: "PICKING",
      itemId: stock.itemId,
      sourceLocationId: null,
      destinationLocationId: outboundWh.id,
      salesOrderId: null,
      quantity: delta,
      userId: systemUser.id,
    });

    const [item] = await db.select().from(items).where(eq(items.id, stock.itemId));
    console.log(
      `  ${item?.sku ?? stock.itemId}: total=${total}, markedOpen=${markedToOpenSos}, unmarked ${currentUnmarked} -> ${desiredUnmarked} (delta ${delta > 0 ? "+" : ""}${delta})`
    );
    correctedCount++;
  }

  console.log(`\nDone. Corrected ${correctedCount} item(s), ${skippedCount} already balanced.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});