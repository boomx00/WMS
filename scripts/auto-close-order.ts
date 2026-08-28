import { config } from "dotenv";
config({ path: ".env.local" });

// One-off: for every sales order dated before Aug 27, 2026 that hasn't
// fully shipped, records the missing amount as SHIP history — closing
// the books on these old orders for reporting/status purposes — WITHOUT
// touching any real stock. This works by inserting pallet_events rows
// directly (bypassing the normal ship endpoint entirely, so
// adjustLocationStock is never called and location_stock/pallets.quantity
// are never modified). Each event still needs a valid pallet_id to
// satisfy the foreign key; the item's existing default-code bucket
// pallet is reused if present, or a harmless zero-quantity placeholder
// is created if not.
const CUTOFF_DATE = "2026-08-27";

async function main() {
  const { db } = await import("../lib/db");
  const { salesOrders, salesOrderItems, items, locations, pallets, palletEvents, users } = await import(
    "../db/schema"
  );
  const { eq, and, lt } = await import("drizzle-orm");
  const { getShippedQuantity } = await import("../lib/shippedQuantity");

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    console.error("No OUTBOUND_WH location found.");
    process.exit(1);
  }

  const [systemUser] = await db.select().from(users).limit(1);
  if (!systemUser) {
    console.error("No users found — can't attribute this action.");
    process.exit(1);
  }

  const oldOrders = await db
    .select()
    .from(salesOrders)
    .where(lt(salesOrders.orderDate, new Date(CUTOFF_DATE)));

  console.log(`Found ${oldOrders.length} sales order(s) dated before ${CUTOFF_DATE}.`);

  let ordersTouched = 0;
  let linesTouched = 0;
  let totalFabricated = 0;

  for (const order of oldOrders) {
    const lines = await db
      .select()
      .from(salesOrderItems)
      .where(eq(salesOrderItems.salesOrderId, order.id));

    let orderTouched = false;

    for (const line of lines) {
      const actualShipped = await getShippedQuantity(db, order.id, line.itemId);
      const shortfall = line.quantity - actualShipped;

      if (shortfall <= 0) continue;

      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      if (!item) continue;

      // Find or create a placeholder pallet to satisfy the FK — quantity
      // is never touched, so this has zero effect on real stock.
      let [bucketPallet] = await db
        .select()
        .from(pallets)
        .where(and(eq(pallets.label, item.defaultCode), eq(pallets.itemId, item.id)));

      if (!bucketPallet) {
        [bucketPallet] = await db
          .insert(pallets)
          .values({
            label: item.defaultCode,
            itemId: item.id,
            workOrderNumber: "HISTORICAL-CLOSE",
            quantity: 0,
            locationId: outboundWh.id,
            status: "OUTBOUND",
            inboundUserId: systemUser.id,
          })
          .returning();
      }

      await db.insert(palletEvents).values({
        palletId: bucketPallet.id,
        type: "OUTBOUND",
        locationId: outboundWh.id,
        userId: systemUser.id,
        quantity: shortfall,
        salesOrderId: order.id,
      });

      linesTouched++;
      totalFabricated += shortfall;
      orderTouched = true;
    }

    if (orderTouched) {
      ordersTouched++;
      console.log(`  Closed ${order.soNumber}`);
    }
  }

  console.log(
    `\nDone. Touched ${ordersTouched} order(s), ${linesTouched} line(s), fabricated ${totalFabricated} total unit(s) of shipped history.`
  );
  console.log("No real stock (location_stock or pallets.quantity) was modified.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});