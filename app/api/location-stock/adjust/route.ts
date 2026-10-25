import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locationStock, locationStockEvents } from "@/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { getMarkedBreakdownForItem } from "@/lib/markedStock";
import { getLocationByCode, isSingleSku } from "@/lib/locationRules";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/adjust
// body: { locationCode, itemSku, newQuantity, reason? }
//
// For staging locations (today OUTBOUND_WH) specifically, per location:
// newQuantity means "how much is actually unclaimed/ecer" — NOT the grand
// total. Reserved (marked-to-SO) stock is left completely untouched; the
// physical total is then recalculated as (current marked) + (new
// unmarked), so reserved stock is never silently absorbed or created by a
// generic count correction.
//
// For every other location, newQuantity is the plain grand total, same as
// before — there's no marked/unmarked concept anywhere else.
//
// Single-SKU safety check, for "Only 1 SKU" location types (today: RACK):
// if the location already has a DIFFERENT item with nonzero stock
// recorded, the adjustment is blocked entirely rather than letting two
// different SKUs both show quantity there — that's very likely a sign the
// wrong SKU was entered. Mixed-SKU types (Floor, Outbound WH, ...) are
// exempt, since they're expected to hold multiple SKUs at once.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "scan.adjustLocation");
  if (denied) return denied;

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

  const location = await getLocationByCode(db, locationCode);
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  if (isSingleSku(location.rules)) {
    const conflictingStock = await db
      .select()
      .from(locationStock)
      .where(
        and(
          eq(locationStock.locationId, location.id),
          ne(locationStock.itemId, item.id),
          ne(locationStock.quantity, 0)
        )
      );

    if (conflictingStock.length > 0) {
      const conflictingItemIds = conflictingStock.map((r) => r.itemId);
      const conflictingItems = await db.select().from(items).where(inArray(items.id, conflictingItemIds));
      const conflictingSkus = conflictingItems.map((i) => i.sku).join(", ");

      return NextResponse.json(
        {
          error: `The SKU in that rack is not the same. ${location.code} currently holds ${conflictingSkus}, not ${item.sku}.`,
        },
        { status: 409 }
      );
    }
  }

  const [existing] = await db
    .select()
    .from(locationStock)
    .where(and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, item.id)));

  const previousQuantity = existing?.quantity ?? 0;

  if (location.isStaging) {
    const currentUnmarked = await getUnclaimedQuantity(db, item.id, location.id);
    const ledgerDelta = newQuantity - currentUnmarked;

    if (ledgerDelta === 0) {
      return NextResponse.json(
        { error: "New quantity is the same as the current unmarked quantity" },
        { status: 400 }
      );
    }

    // Everything still marked to an open SO or a Tambahan in THIS staging
    // location — reserved stock, never touched by this action.
    const { totalMarked } = await getMarkedBreakdownForItem(db, item.id, location.id);

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