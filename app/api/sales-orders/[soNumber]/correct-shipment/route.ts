import { NextRequest, NextResponse } from "next/server";
import {
  items,
  salesOrders,
  salesOrderItems,
  pallets,
  palletEvents,
  locationStockEvents,
  locations,
} from "@/db/schema";
import { db } from "@/lib/db";
import { eq, and, or } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { getShippedQuantity } from "@/lib/shippedQuantity";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/sales-orders/:soNumber/correct-shipment
// body: { sku, correctedQuantity, reason }
//
// Admin-only fix for an OVER-recorded shipped quantity (e.g. 928 recorded
// but only 920 actually went out). Decrease-only by design: correctedQuantity
// must be less than the current shipped amount, so this can't be used to
// silently inflate what's shipped — only to walk it back down. The
// difference is returned to Outbound WH's unclaimed ("ecer") pool.
//
// This does NOT edit the original OUTBOUND / SHIP rows in place — that
// would erase what the system actually recorded at the time. Instead it
// appends a negative-delta correction event to both ledgers, the same way
// every other quantity fix in this app works (see /api/pallets/correct-quantity):
//   - pallet_events gets a new "OUTBOUND" row with a negative quantity
//     (getShippedQuantity() sums exactly that type, so this is what
//     actually pulls the shown number down).
//   - location_stock_events gets a matching "SHIP" row, so the raw sum
//     used by /api/sales-orders/search-any stays consistent too.
//   - Outbound WH's physical stock goes UP by the same amount taken off
//     shipped. Since the reserved/"marked" amount for this SO is computed
//     separately (via picked-for-SO) and is untouched by this correction,
//     the residual (total − marked) — i.e. ecer — increases by exactly
//     that amount, same as any other unmarked-stock correction.
// Both correction rows are tied to the item's default (unlabelled) bucket
// pallet at Outbound WH, same bucket the normal ship flow falls back to
// when it isn't scanning one specific physical pallet.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const authorized = await hasRole(session.userId, ["Admin"]);
  if (!authorized) {
    return NextResponse.json(
      { error: "Only Admin can correct a shipped quantity" },
      { status: 403 }
    );
  }

  const { soNumber } = await params;
  const body = await req.json();
  const sku = sanitize(body.sku ?? "");
  const reason = sanitize(body.reason ?? "");
  const { correctedQuantity } = body;

  if (!sku || correctedQuantity === undefined || correctedQuantity < 0) {
    return NextResponse.json(
      { error: "sku and a non-negative correctedQuantity are required" },
      { status: 400 }
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "A reason is required for a shipment correction" },
      { status: 400 }
    );
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [orderLine] = await db
    .select()
    .from(salesOrderItems)
    .where(and(eq(salesOrderItems.salesOrderId, salesOrder.id), eq(salesOrderItems.itemId, item.id)));
  if (!orderLine) {
    return NextResponse.json({ error: `This item isn't on sales order ${soNumber}` }, { status: 400 });
  }

  const currentShipped = await getShippedQuantity(db, salesOrder.id, item.id);

  if (correctedQuantity >= currentShipped) {
    return NextResponse.json(
      {
        error: `Corrected quantity must be less than the current shipped amount (${currentShipped}). This endpoint only fixes over-recorded shipments — it can't increase what's shipped.`,
      },
      { status: 400 }
    );
  }

  const delta = correctedQuantity - currentShipped; // always negative here
  const returnedToEcer = -delta; // e.g. shipped 5 -> corrected to 3 means 2 goes back to Outbound WH

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  try {
    await db.transaction(async (tx) => {
      const [existingBucket] = await tx
        .select()
        .from(pallets)
        .where(and(eq(pallets.label, item.defaultCode), eq(pallets.locationId, outboundWh.id)));

      let bucket;
      if (existingBucket) {
        [bucket] = await tx
          .update(pallets)
          .set({
            quantity: existingBucket.quantity - delta,
            status: "ACTIVE",
            removedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(pallets.id, existingBucket.id))
          .returning();
      } else {
        [bucket] = await tx
          .insert(pallets)
          .values({
            label: item.defaultCode,
            itemId: item.id,
            workOrderNumber: "SHIPMENT-CORRECTION",
            quantity: -delta,
            locationId: outboundWh.id,
            status: "ACTIVE",
            inboundUserId: session.userId,
          })
          .returning();
      }

      // Same type ("OUTBOUND") getShippedQuantity() sums — a negative
      // delta here is what actually pulls the shown number down.
      await tx.insert(palletEvents).values({
        palletId: bucket.id,
        type: "OUTBOUND",
        locationId: outboundWh.id,
        userId: session.userId,
        quantity: delta,
        salesOrderId: salesOrder.id,
      });

      // Mirror on the v2 ledger so the raw location_stock_events sum
      // (used by /search-any) stays consistent with the same correction.
      await tx.insert(locationStockEvents).values({
        type: "SHIP",
        itemId: item.id,
        sourceLocationId: outboundWh.id,
        destinationLocationId: null,
        salesOrderId: salesOrder.id,
        quantity: delta,
        userId: session.userId,
      });

      // Fewer units shipped than recorded (delta < 0) means those units
      // never left — put them back in the physical Outbound WH count.
      await adjustLocationStock(tx, outboundWh.id, item.id, -delta);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to correct shipment";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    soNumber,
    itemSku: item.sku,
    previousShipped: currentShipped,
    newShipped: correctedQuantity,
    returnedToEcer,
    reason,
  });
}