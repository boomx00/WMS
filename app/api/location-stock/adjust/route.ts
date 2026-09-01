import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, locationStock, locationStockEvents, salesOrders, salesOrderItems } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { getShippedQuantity } from "@/lib/shippedQuantity";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/adjust
// body: { locationCode, itemSku, newQuantity, reason? }
//
// For OUTBOUND_WH specifically: newQuantity means "how much is actually
// unclaimed/ecer" — NOT the grand total. Reserved (marked-to-SO) stock is
// left completely untouched; the physical total is then recalculated as
// (current marked) + (new unmarked), so reserved stock is never silently
// absorbed or created by a generic count correction.
//
// For every other location type, newQuantity is the plain grand total,
// same as before — there's no marked/unmarked concept anywhere else.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const locationCode = sanitize(body.locationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const reason = sanitize(body.reason ?? "");
  const { newQuantity } = body;

  if (!locationCode || !itemSku || newQuantity === undefined || newQuantity < 0) {
    return NextResponse.json(
      { error: "locationCode, itemSku, and a non-negative newQuantity are required" },
      { status: 400 }
    );
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(locationStock)
    .where(and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, item.id)));

  const previousQuantity = existing?.quantity ?? 0;

  if (location.type === "OUTBOUND_WH") {
    const currentUnmarked = await getUnclaimedQuantity(db, item.id);
    const ledgerDelta = newQuantity - currentUnmarked;

    if (ledgerDelta === 0) {
      return NextResponse.json({ error: "New quantity is the same as the current unmarked quantity" }, { status: 400 });
    }

    // Sum of everything still marked to an OPEN SO — reserved stock,
    // never touched by this action.
    const soRows = await db
      .selectDistinct({ salesOrderId: locationStockEvents.salesOrderId })
      .from(locationStockEvents)
      .where(and(eq(locationStockEvents.itemId, item.id), isNotNull(locationStockEvents.salesOrderId)));

    let totalMarked = 0;
    for (const row of soRows) {
      if (row.salesOrderId === null) continue;
      const [orderLine] = await db
        .select()
        .from(salesOrderItems)
        .where(
          and(eq(salesOrderItems.salesOrderId, row.salesOrderId), eq(salesOrderItems.itemId, item.id))
        );
      if (!orderLine) continue;

      const shipped = await getShippedQuantity(db, row.salesOrderId, item.id);
      if (shipped >= orderLine.quantity) continue; // completed, ignore

      totalMarked += Math.max(0, await getPickedForSoQuantity(db, row.salesOrderId, item.id));
    }

    const newTotal = totalMarked + newQuantity;

    await db.transaction(async (tx) => {
      if (existing) {
        await tx
          .update(locationStock)
          .set({ quantity: newTotal, updatedAt: new Date() })
          .where(eq(locationStock.id, existing.id));
      } else {
        await tx.insert(locationStock).values({ locationId: location.id, itemId: item.id, quantity: newTotal });
      }

      // Untagged correction — nudges the unmarked pool by exactly what's needed.
      await tx.insert(locationStockEvents).values({
        type: "PICKING",
        itemId: item.id,
        sourceLocationId: null,
        destinationLocationId: location.id,
        salesOrderId: null,
        quantity: ledgerDelta,
        userId: session.userId,
      });
    });

    return NextResponse.json({
      locationCode: location.code,
      itemSku: item.sku,
      previousUnmarked: currentUnmarked,
      newUnmarked: newQuantity,
      totalMarked,
      previousTotal: previousQuantity,
      newTotal,
      reason: reason || undefined,
    });
  }

  // Non-Outbound-WH: plain grand-total adjustment, unchanged from before.
  const delta = newQuantity - previousQuantity;
  if (delta === 0) {
    return NextResponse.json({ error: "New quantity is the same as the current quantity" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(locationStock)
        .set({ quantity: newQuantity, updatedAt: new Date() })
        .where(eq(locationStock.id, existing.id));
    } else {
      await tx.insert(locationStock).values({ locationId: location.id, itemId: item.id, quantity: newQuantity });
    }

    await tx.insert(locationStockEvents).values({
      type: "ADJUSTMENT",
      itemId: item.id,
      sourceLocationId: null,
      destinationLocationId: location.id,
      quantity: delta,
      userId: session.userId,
    });
  });

  return NextResponse.json({
    locationCode: location.code,
    itemSku: item.sku,
    previousQuantity,
    newQuantity,
    delta,
    reason: reason || undefined,
  });
}