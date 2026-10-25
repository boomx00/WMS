import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items, locationStockEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { resolvePurposeLocation } from "@/lib/locationRules";
import { denyUnlessPdaAllowed } from "@/lib/pdaPermissions";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { isMarkingEnabled, MARKING_OFF_ERROR } from "@/lib/stagingMarks";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// POST /api/sales-orders/:soNumber/claim
// body: { itemSku, quantity, stagingLocationCode? }
// Pulls quantity out of the unclaimed ("ecer") stock in one staging
// location (default: Settings → Locations & Marking) and earmarks it for this SO
// there — no physical stock moves, this is purely an accounting
// reassignment. Capped by both what's unclaimed in that location and what
// the SO still needs.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessPdaAllowed(session, "pda.ship");
  if (denied) return denied;

  // Marking stock for an order only means something with marking on.
  if (!(await isMarkingEnabled(db))) {
    return NextResponse.json({ error: MARKING_OFF_ERROR }, { status: 409 });
  }

  const { soNumber } = await params;
  const body = await req.json();
  const itemSku = sanitize(body.itemSku ?? "");
  const { quantity } = body;

  if (!itemSku || !quantity || quantity <= 0) {
    return NextResponse.json({ error: "itemSku and a positive quantity are required" }, { status: 400 });
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [orderLine] = await db
    .select()
    .from(salesOrderItems)
    .where(and(eq(salesOrderItems.salesOrderId, salesOrder.id), eq(salesOrderItems.itemId, item.id)));
  if (!orderLine) {
    return NextResponse.json({ error: `${itemSku} isn't on sales order ${soNumber}` }, { status: 400 });
  }

const currentlyEarmarked = Math.max(0, await getPickedForSoQuantity(db, salesOrder.id, item.id));
const stillNeeded = orderLine.quantity - currentlyEarmarked;
  if (quantity > stillNeeded) {
    return NextResponse.json(
      { error: `SO ${soNumber} only needs ${stillNeeded} more of ${itemSku}` },
      { status: 409 }
    );
  }

  const staging = await resolvePurposeLocation(db, "staging", body.stagingLocationCode);
  if ("error" in staging) {
    return NextResponse.json({ error: staging.error }, { status: staging.status });
  }
  const outboundWh = staging.location;

  const unclaimed = await getUnclaimedQuantity(db, item.id, outboundWh.id);
  if (quantity > unclaimed) {
    return NextResponse.json(
      { error: `Only ${unclaimed} units of ${itemSku} are unclaimed in ${outboundWh.code}` },
      { status: 409 }
    );
  }

  await db.insert(locationStockEvents).values({
    type: "CLAIM",
    itemId: item.id,
    sourceLocationId: outboundWh.id,
    destinationLocationId: outboundWh.id,
    salesOrderId: salesOrder.id,
    quantity,
    userId: session.userId,
  });

  return NextResponse.json({ soNumber, itemSku, claimed: quantity });
}