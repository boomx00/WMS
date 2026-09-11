import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locations, tambahanOrders, locationStockEvents } from "@/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";
import { getPickedForTambahanQuantity } from "@/lib/pickedForTambahan";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/outbound-breakdown/return-tambahan
// body: { itemSku, tambahanNumber, mode: "ECER" | "ORIGINAL_LOCATION" }
//
// Releases whatever is currently outstanding (picked-but-unshipped) for
// this SKU under this Tambahan. Two modes:
//
//   ECER — pure ledger reattribution, no physical stock movement. Logs a
//   negative CLAIM tagged to this Tambahan, which both (a) reduces this
//   Tambahan's marked total by the outstanding amount, per
//   getPickedForTambahanQuantity's formula, and (b) is picked up by
//   getUnclaimedQuantity's residual calc automatically — the released
//   amount becomes available again as general unmarked stock, with
//   nothing to reconcile by hand.
//
//   ORIGINAL_LOCATION — physically moves the outstanding quantity back
//   from Outbound WH to wherever it was actually picked from, walking
//   this Tambahan's own PICKING/DEFAULT_PICKING history for this item in
//   reverse order (most recent pick reversed first) until the
//   outstanding amount is fully covered. Each reversal is logged as a
//   negative-quantity PICKING event with the same source/destination
//   pairing as the original pick — this both physically moves the stock
//   back (via adjustLocationStock) and naturally reduces the Tambahan's
//   marked total, using the same signed-quantity convention RELEASE/CLAIM
//   already use elsewhere in the ledger.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const itemSku = sanitize(body.itemSku ?? "");
  const tambahanNumber = sanitize(body.tambahanNumber ?? "");
  const mode = body.mode;

  if (!itemSku || !tambahanNumber || (mode !== "ECER" && mode !== "ORIGINAL_LOCATION")) {
    return NextResponse.json(
      { error: "itemSku, tambahanNumber, and mode ('ECER' or 'ORIGINAL_LOCATION') are required" },
      { status: 400 }
    );
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [tambahan] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.tambahanNumber, tambahanNumber));
  if (!tambahan) {
    return NextResponse.json({ error: "Unknown Tambahan number" }, { status: 404 });
  }

  const outstanding = await getPickedForTambahanQuantity(db, tambahan.id, item.id);
  if (outstanding <= 0) {
    return NextResponse.json({ error: "Nothing outstanding for this SKU under this Tambahan" }, { status: 400 });
  }

  if (mode === "ECER") {
    await db.insert(locationStockEvents).values({
      type: "CLAIM",
      itemId: item.id,
      sourceLocationId: null,
      destinationLocationId: null,
      salesOrderId: null,
      tambahanOrderId: tambahan.id,
      quantity: -outstanding,
      userId: session.userId,
    });

    return NextResponse.json({ mode, itemSku, released: outstanding, destination: "OUTBOUND_WH (ecer)" });
  }

  // ORIGINAL_LOCATION
  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  // Original pick events for this item under this Tambahan, most recent
  // first — only positive-quantity PICKING/DEFAULT_PICKING rows (a prior
  // reversal would already be a negative-quantity row of the same type,
  // excluded here so it can't be "un-reversed" a second time).
  const pickEvents = await db
    .select({
      id: locationStockEvents.id,
      sourceLocationId: locationStockEvents.sourceLocationId,
      quantity: locationStockEvents.quantity,
    })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahan.id),
        eq(locationStockEvents.itemId, item.id),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING')`,
        sql`${locationStockEvents.quantity} > 0`
      )
    )
    .orderBy(desc(locationStockEvents.createdAt));

  let remaining = outstanding;
  const allocations: { sourceLocationId: number; amount: number }[] = [];

  for (const ev of pickEvents) {
    if (remaining <= 0) break;
    if (!ev.sourceLocationId) continue;
    const take = Math.min(remaining, ev.quantity);
    if (take <= 0) continue;
    allocations.push({ sourceLocationId: ev.sourceLocationId, amount: take });
    remaining -= take;
  }

  if (remaining > 0) {
    return NextResponse.json(
      {
        error: `Could only trace ${outstanding - remaining} of ${outstanding} back to a specific pick location — the rest has no recorded source (likely from a manual correction, not an actual pick). Use "kembalikan ke ecer" instead, or resolve the remainder manually.`,
      },
      { status: 409 }
    );
  }

  // Merge allocations by location in case the same location was picked
  // from more than once, so we log one clean event per location rather
  // than several fragments.
  const byLocation = new Map<number, number>();
  for (const a of allocations) {
    byLocation.set(a.sourceLocationId, (byLocation.get(a.sourceLocationId) ?? 0) + a.amount);
  }

  const locationRows = await db
    .select()
    .from(locations)
    .where(inArray(locations.id, Array.from(byLocation.keys())));
  const codeById = new Map(locationRows.map((l) => [l.id, l.code]));

  await db.transaction(async (tx) => {
    for (const [sourceLocationId, amount] of byLocation) {
      await adjustLocationStock(tx, sourceLocationId, item.id, amount);
      await adjustLocationStock(tx, outboundWh.id, item.id, -amount);

      await tx.insert(locationStockEvents).values({
        type: "PICKING",
        itemId: item.id,
        sourceLocationId,
        destinationLocationId: outboundWh.id,
        salesOrderId: null,
        tambahanOrderId: tambahan.id,
        quantity: -amount,
        userId: session.userId,
      });
    }
  });

  return NextResponse.json({
    mode,
    itemSku,
    released: outstanding,
    destinations: Array.from(byLocation.entries()).map(([id, amount]) => ({
      locationCode: codeById.get(id) ?? "?",
      amount,
    })),
  });
}