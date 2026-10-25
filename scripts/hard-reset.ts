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
  const { items, locationStock, salesOrders, salesOrderItems, locationStockEvents } =
    await import("../db/schema");
  const { eq, and, inArray } = await import("drizzle-orm");
  const { getMarkRows } = await import("../lib/stagingMarks");
  const { getShippedQuantity } = await import("../lib/shippedQuantity");
  const { getUnclaimedQuantity } = await import("../lib/unclaimedStock");

  const { getStagingLocationIds } = await import("../lib/locationRules");
  const stagingIds = await getStagingLocationIds(db);
  if (stagingIds.length === 0) {
    console.error("No staging location — set one in 'Used for' on the Locations page.");
    process.exit(1);
  }

  const { users } = await import("../db/schema");
  const [systemUser] = await db.select().from(users).limit(1);
  if (!systemUser) {
    console.error("No users found — can't attribute this action.");
    process.exit(1);
  }

  // Every item in every staging location — balanced per location, since
  // marked stock is tracked per staging location.
  const stockRows = await db
    .select({ locationId: locationStock.locationId, itemId: locationStock.itemId, quantity: locationStock.quantity })
    .from(locationStock)
    .where(inArray(locationStock.locationId, stagingIds));

  console.log(`Checking ${stockRows.length} item(s) currently in staging...`);

  let correctedCount = 0;
  let skippedCount = 0;

  for (const stock of stockRows) {
    const total = stock.quantity;

    // What's marked to each SO in this location.
    const marks = await getMarkRows(db, { itemId: stock.itemId, locationId: stock.locationId });

    let markedToOpenSos = 0;
    for (const mark of marks) {
      if (mark.salesOrderId === null) continue;

      const [orderLine] = await db
        .select()
        .from(salesOrderItems)
        .where(
          and(
            eq(salesOrderItems.salesOrderId, mark.salesOrderId),
            eq(salesOrderItems.itemId, stock.itemId)
          )
        );
      if (!orderLine) continue;

      const shipped = await getShippedQuantity(db, mark.salesOrderId, stock.itemId);
      const isOpen = shipped < orderLine.quantity;
      if (!isOpen) continue;

      markedToOpenSos += Math.max(0, mark.quantity);
    }

    const desiredUnmarked = Math.max(0, total - markedToOpenSos);
    const currentUnmarked = await getUnclaimedQuantity(db, stock.itemId, stock.locationId);
    const delta = desiredUnmarked - currentUnmarked;

    if (delta === 0) {
      skippedCount++;
      continue;
    }

    // A single untagged PICKING correction event nudges this location's
    // unmarked stock by exactly `delta`.
    await db.insert(locationStockEvents).values({
      type: "PICKING",
      itemId: stock.itemId,
      sourceLocationId: null,
      destinationLocationId: stock.locationId,
      salesOrderId: null,
      quantity: delta,
      userId: systemUser.id,
    });

    const [item] = await db.select().from(items).where(eq(items.id, stock.itemId));
    console.log(
      `  ${item?.sku ?? stock.itemId} @ location ${stock.locationId}: total=${total}, markedOpen=${markedToOpenSos}, unmarked ${currentUnmarked} -> ${desiredUnmarked} (delta ${delta > 0 ? "+" : ""}${delta})`
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