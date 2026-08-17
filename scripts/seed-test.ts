import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const {
    items,
    locations,
    pallets,
    locationStock,
    salesOrders,
    salesOrderItems,
    palletEvents,
    users,
  } = await import("../db/schema");
  const { db } = await import("../lib/db");
  const { eq, and } = await import("drizzle-orm");

  console.log("=== V2 expanded test case setup ===\n");

  // ---------------------------------------------------------------
  // Pick a handful of existing items. Change these SKUs to whatever
  // real ones exist in your DB if these don't match.
  // ---------------------------------------------------------------
  const SKUS = [
    "0201003000041", // A
    "14013024102", // B
    "14012023550", // C
    "14013073701", // D (has a legacy code mapped — good extra test case)
  ];

  const itemRows = await Promise.all(
    SKUS.map(async (sku) => {
      const [item] = await db.select().from(items).where(eq(items.sku, sku));
      return item;
    })
  );

  if (itemRows.some((i) => !i)) {
    console.error("Missing item(s) — check the SKUS array matches what's in your items table.");
    console.error(SKUS.map((sku, i) => `${sku}: ${itemRows[i] ? "found" : "MISSING"}`).join("\n"));
    process.exit(1);
  }
  const [itemA, itemB, itemC, itemD] = itemRows;
  console.log(
    "Using items:",
    itemRows.map((i) => `${i.sku} (${i.name}, ${i.palletCartonQty} cartons/pallet)`).join(", ")
  );

  // ---------------------------------------------------------------
  // Locations: three distinct rack cells + Floor.
  // ---------------------------------------------------------------
  const RACK_CODES = ["B.2.1", "B.2.2", "C.3.1"];
  const FLOOR_CODE = "FLOOR";

  const rackLocs = await Promise.all(
    RACK_CODES.map(async (code) => {
      const [loc] = await db.select().from(locations).where(eq(locations.code, code));
      return loc;
    })
  );
  const [floorLoc] = await db.select().from(locations).where(eq(locations.code, FLOOR_CODE));

  if (rackLocs.some((l) => !l) || !floorLoc) {
    console.error("Missing location(s) — check RACK_CODES and FLOOR_CODE exist.");
    process.exit(1);
  }
  const [rackB21, rackB22, rackC31] = rackLocs;

  const [testUser] = await db.select().from(users);
  if (!testUser) {
    console.error("No users found — create at least one user first.");
    process.exit(1);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  async function resetLabel(label: string) {
    const existing = await db.select().from(pallets).where(eq(pallets.label, label));
    for (const p of existing) {
      await db.delete(palletEvents).where(eq(palletEvents.palletId, p.id));
      await db.delete(pallets).where(eq(pallets.id, p.id));
    }
  }

  async function setLocationStock(locationId: number, itemId: number, quantity: number) {
    const [existing] = await db
      .select()
      .from(locationStock)
      .where(and(eq(locationStock.locationId, locationId), eq(locationStock.itemId, itemId)));
    if (existing) {
      await db
        .update(locationStock)
        .set({ quantity, updatedAt: new Date() })
        .where(eq(locationStock.id, existing.id));
    } else {
      await db.insert(locationStock).values({ locationId, itemId, quantity });
    }
  }

  // ---------------------------------------------------------------
  // Plan: each rack cell holds ONE SKU but multiple pallets stacked.
  // Each pallet's quantity = item.palletCartonQty * multiplier, so
  // every pallet realistically represents 1x, 1x, or 2x a full pallet
  // load of cartons — never an arbitrary number.
  //
  //   B.2.1 — itemA — 3 pallets: 1x, 1x, 2x palletCartonQty
  //   B.2.2 — itemB — 2 pallets: 1x, 1x
  //   C.3.1 — itemC — 3 pallets: 1x, 1x, 1x
  //   FLOOR — itemD — 1 pallet: 3x (a bigger consolidated load)
  // ---------------------------------------------------------------
  const plan = [
    { location: rackB21, item: itemA, workOrder: "TESTMO-A", multipliers: [1, 1, 2] },
    { location: rackB22, item: itemB, workOrder: "TESTMO-B", multipliers: [1, 1] },
    { location: rackC31, item: itemC, workOrder: "TESTMO-C", multipliers: [1, 1, 1] },
    { location: floorLoc, item: itemD, workOrder: "TESTMO-D", multipliers: [3] },
  ];

  console.log("\nPlacing test pallets...");

  for (const group of plan) {
    let locationTotal = 0;
    const perPallet = group.item.palletCartonQty;

    for (let i = 0; i < group.multipliers.length; i++) {
      const multiplier = group.multipliers[i];
      const qty = perPallet * multiplier;
      const seq = `T0${i + 1}`;
      const label = `*${group.item.sku}*${seq}*5000*${group.workOrder}`;

      await resetLabel(label);

      await db.insert(pallets).values({
        label,
        itemId: group.item.id,
        workOrderNumber: group.workOrder,
        quantity: qty,
        locationId: group.location.id,
        status: "ACTIVE",
        inboundUserId: testUser.id,
      });

      locationTotal += qty;
      console.log(
        `  ${label} — qty ${qty} (${multiplier}x ${perPallet}/pallet) @ ${group.location.code}`
      );
    }

    await setLocationStock(group.location.id, group.item.id, locationTotal);
    console.log(`  -> ${group.location.code} total for ${group.item.sku}: ${locationTotal}\n`);
  }

  // ---------------------------------------------------------------
  // Three sales orders. Quantities are also chosen as sensible
  // fractions/multiples of what's actually on hand, not arbitrary.
  // ---------------------------------------------------------------
  async function upsertSalesOrder(soNumber: string, lines: { item: typeof itemA; qty: number }[]) {
    const [existing] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
    if (existing) {
      await db.delete(salesOrderItems).where(eq(salesOrderItems.salesOrderId, existing.id));
      await db.delete(salesOrders).where(eq(salesOrders.id, existing.id));
    }
    const [order] = await db
      .insert(salesOrders)
      .values({ soNumber, orderDate: new Date() })
      .returning();
    await db.insert(salesOrderItems).values(
      lines.map((l) => ({ salesOrderId: order.id, itemId: l.item.id, quantity: l.qty }))
    );
    return order;
  }

  console.log("Creating sales orders...\n");

  const totalA = itemA.palletCartonQty * 4; // matches the 1+1+2 multiplier total at B.2.1
  const totalB = itemB.palletCartonQty * 2; // matches 1+1 at B.2.2
  const totalC = itemC.palletCartonQty * 3; // matches 1+1+1 at C.3.1
  const totalD = itemD.palletCartonQty * 3; // matches the single pallet at FLOOR

  await upsertSalesOrder("SO1", [{ item: itemA, qty: itemA.palletCartonQty * 2 }]);
  console.log(`SO1: ${itemA.sku} x${itemA.palletCartonQty * 2} (${totalA} available)`);

  await upsertSalesOrder("SO2", [
    { item: itemB, qty: itemB.palletCartonQty }, // exactly one pallet's worth
    { item: itemC, qty: itemC.palletCartonQty * 4 }, // more than the 3 pallets on hand — intentionally over
  ]);
  console.log(
    `SO2: ${itemB.sku} x${itemB.palletCartonQty} (${totalB} available), ${itemC.sku} x${itemC.palletCartonQty * 4} (only ${totalC} available — intentionally over)`
  );

  await upsertSalesOrder("SO3", [
    { item: itemA, qty: itemA.palletCartonQty },
    { item: itemB, qty: itemB.palletCartonQty },
    { item: itemD, qty: itemD.palletCartonQty * 2 },
  ]);
  console.log(
    `SO3: ${itemA.sku} x${itemA.palletCartonQty}, ${itemB.sku} x${itemB.palletCartonQty}, ${itemD.sku} x${itemD.palletCartonQty * 2} (all comfortably in stock)`
  );

  console.log("\n=== Suggested test walkthrough ===");
  console.log(`1. Picking v2 at ${rackB21.code}: shows ${itemA.sku}, qty ${totalA} — pick e.g. ${itemA.palletCartonQty * 2} for SO1`);
  console.log(`2. Picking v2 at ${rackB22.code} and ${rackC31.code}: pick partial amounts for SO2`);
  console.log(`3. Try Ship v2 against SO2 for ${itemC.sku} beyond what's available — should correctly block`);
  console.log(`4. Ship v2: scan one individual pallet label and ship LESS than its full qty — confirm the label retires and the leftover folds into ${itemA.sku}*default at Outbound WH`);
  console.log(`5. Scan the SKU*default barcode directly on a later ship to confirm it draws down that shared bucket`);
  console.log(`6. Check /location-stock and /sales-orders throughout to confirm totals stay consistent`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});