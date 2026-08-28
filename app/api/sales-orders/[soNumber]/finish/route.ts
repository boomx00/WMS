import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, locations, locationStockEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { getShippedQuantity } from "@/lib/shippedQuantity";

// POST /api/sales-orders/:soNumber/finish
// For every item on this SO, releases anything that was picked/earmarked
// but never actually shipped back to the general Outbound WH pool — e.g.
// a whole extra pallet that didn't fit on the truck. Logged as a RELEASE
// event (negative quantity), so it's fully reversible via Undo, and the
// original PICKING history is never altered.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { soNumber } = await params;

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  if (salesOrder.finishedAt) {
    return NextResponse.json({ error: "This sales order is already finished" }, { status: 409 });
  }

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  const lines = await db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.salesOrderId, salesOrder.id));

  const releases: { itemId: number; quantity: number }[] = [];

  for (const line of lines) {
const leftover = await getPickedForSoQuantity(db, salesOrder.id, line.itemId);
    if (leftover > 0) {
      releases.push({ itemId: line.itemId, quantity: leftover });
    }
  }

  await db.transaction(async (tx) => {
    for (const r of releases) {
      await tx.insert(locationStockEvents).values({
        type: "RELEASE",
        itemId: r.itemId,
        sourceLocationId: outboundWh.id,
        destinationLocationId: null,
        salesOrderId: salesOrder.id,
        quantity: -r.quantity,
        userId: session.userId,
      });
    }

    await tx
      .update(salesOrders)
      .set({ finishedAt: new Date(), finishedBy: session.userId })
      .where(eq(salesOrders.id, salesOrder.id));
  });

  return NextResponse.json({
    soNumber,
    releasedLines: releases.length,
    releases,
  });
}