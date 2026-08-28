import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items, locationStockEvents, locations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// POST /api/sales-orders/:soNumber/claim
// body: { itemSku, quantity }
// Pulls quantity out of the general unclaimed ("ecer") pool at Outbound WH
// and earmarks it for this SO — no physical stock moves, this is purely
// an accounting reassignment. Capped by both what's actually unclaimed
// and what the SO still needs.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
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
  if (salesOrder.finishedAt) {
    return NextResponse.json({ error: "This sales order has already been finished" }, { status: 409 });
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

  const unclaimed = await getUnclaimedQuantity(db, item.id);
  if (quantity > unclaimed) {
    return NextResponse.json(
      { error: `Only ${unclaimed} units of ${itemSku} are unclaimed in Outbound WH` },
      { status: 409 }
    );
  }

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
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