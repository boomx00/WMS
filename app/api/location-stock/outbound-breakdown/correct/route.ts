import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, salesOrders, locationStockEvents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getMarkedAt, isMarkingEnabled, MARKING_OFF_ERROR } from "@/lib/stagingMarks";
import { resolvePurposeLocation } from "@/lib/locationRules";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/outbound-breakdown/correct
// body: { itemSku, soNumber, newQuantity, locationCode? }
//
// Directly corrects how much of an item is marked to a specific SO in one
// staging location (default: Settings → Locations & Marking) — for fixing a mistyped
// claim amount. Works by inserting a CLAIM event with
// whatever signed delta is needed to reach newQuantity; since "marked" and
// "unmarked" are just two sides of the same computed total, correcting
// one side automatically corrects the other (the location's total itself
// is never touched, only the accounting split).
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locationStock.editOutboundWh");
  if (denied) return denied;

  // Marking stock for an order only means something with marking on.
  if (!(await isMarkingEnabled(db))) {
    return NextResponse.json({ error: MARKING_OFF_ERROR }, { status: 409 });
  }

  const body = await req.json();
  const itemSku = sanitize(body.itemSku ?? "");
  const soNumber = sanitize(body.soNumber ?? "");
  const { newQuantity } = body;

  if (!itemSku || !soNumber || newQuantity === undefined || newQuantity < 0) {
    return NextResponse.json(
      { error: "itemSku, soNumber, and a non-negative newQuantity are required" },
      { status: 400 }
    );
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  const staging = await resolvePurposeLocation(db, "staging", body.locationCode);
  if ("error" in staging) {
    return NextResponse.json({ error: staging.error }, { status: staging.status });
  }
  const location = staging.location;

  const currentMarked = await getMarkedAt(db, { salesOrderId: salesOrder.id }, item.id, location.id);
  const delta = newQuantity - currentMarked;

  if (delta === 0) {
    return NextResponse.json({ error: "New quantity is the same as the current marked quantity" }, { status: 400 });
  }

  await db.insert(locationStockEvents).values({
    type: "CLAIM",
    itemId: item.id,
    sourceLocationId: location.id,
    destinationLocationId: location.id,
    salesOrderId: salesOrder.id,
    quantity: delta,
    userId: session.userId,
  });

  return NextResponse.json({ itemSku, soNumber, previousMarked: currentMarked, newQuantity, delta });
}