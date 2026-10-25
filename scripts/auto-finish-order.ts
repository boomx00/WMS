import { config } from "dotenv";
config({ path: ".env.local" });

// One-off cleanup: any SO that isn't yet marked finished, but where every
// line item has fully shipped (shipped >= ordered), gets auto-finished.
// This releases any leftover marked-but-unshipped stock back to the
// unclaimed pool, same as a normal manual Finish — just applied in bulk
// for historical orders that were completed before the Finish feature
// existed. Safe to run more than once; already-finished orders are
// skipped entirely.
async function main() {
  const { db } = await import("../lib/db");
  const { salesOrders, salesOrderItems, locationStockEvents, users } = await import("../db/schema");
  const { eq, isNull } = await import("drizzle-orm");
  const { getShippedQuantity } = await import("../lib/shippedQuantity");
  const { getPickedForSoQuantity } = await import("../lib/pickedForSo");

  const { getMarkedLocations } = await import("../lib/stagingMarks");

  // A system/admin user to attribute this bulk action to.
  const [systemUser] = await db.select().from(users).limit(1);
  if (!systemUser) {
    console.error("No users found — can't attribute this action.");
    process.exit(1);
  }

  const unfinishedOrders = await db
    .select()
    .from(salesOrders)
    .where(isNull(salesOrders.finishedAt));

  console.log(`Checking ${unfinishedOrders.length} unfinished sales order(s)...`);

  let finishedCount = 0;
  let skippedCount = 0;
  let totalReleased = 0;

  for (const order of unfinishedOrders) {
    const lines = await db
      .select()
      .from(salesOrderItems)
      .where(eq(salesOrderItems.salesOrderId, order.id));

    if (lines.length === 0) {
      skippedCount++;
      continue;
    }

    let allComplete = true;
    const releases: { itemId: number; locationId: number; quantity: number }[] = [];

    for (const line of lines) {
      const shipped = await getShippedQuantity(db, order.id, line.itemId);
      if (shipped < line.quantity) {
        allComplete = false;
        break;
      }

      // Even though fully shipped, there could still be leftover marked
      // stock (e.g. an extra pallet earmarked but never shipped, or
      // positive drift) — release it same as a normal Finish would.
      const pickedForSo = Math.max(0, await getPickedForSoQuantity(db, order.id, line.itemId));
      let leftover = pickedForSo - shipped;
      // Released from the staging locations it's marked in, largest first.
      const marked = [...(await getMarkedLocations(db, { salesOrderId: order.id }, line.itemId))]
        .filter(([, qty]) => qty > 0)
        .sort((a, b) => b[1] - a[1]);
      for (const [locationId, qty] of marked) {
        if (leftover <= 0) break;
        const take = Math.min(leftover, qty);
        releases.push({ itemId: line.itemId, locationId, quantity: take });
        leftover -= take;
      }
    }

    if (!allComplete) {
      skippedCount++;
      continue;
    }

    await db.transaction(async (tx) => {
      for (const r of releases) {
        await tx.insert(locationStockEvents).values({
          type: "RELEASE",
          itemId: r.itemId,
          sourceLocationId: r.locationId,
          destinationLocationId: null,
          salesOrderId: order.id,
          quantity: -r.quantity,
          userId: systemUser.id,
        });
      }

      await tx
        .update(salesOrders)
        .set({ finishedAt: new Date(), finishedBy: systemUser.id })
        .where(eq(salesOrders.id, order.id));
    });

    finishedCount++;
    totalReleased += releases.reduce((sum, r) => sum + r.quantity, 0);
    console.log(`  Finished ${order.soNumber} (released ${releases.length} line(s))`);
  }

  console.log(`\nDone. Finished ${finishedCount} order(s), skipped ${skippedCount} (incomplete or empty).`);
  console.log(`Total units released back to unclaimed pool: ${totalReleased}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});