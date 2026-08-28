import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, settings, locationStockEvents, locationStock, salesOrders, salesOrderItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/pick
// body: { locationCode, itemSku, quantity, soNumber? }
//
// If soNumber is given, the amount actually credited to that SO is capped
// at what it still needs (ordered − already earmarked). Any excess (e.g.
// a picker had to take a whole extra pallet to cover a partial-pallet
// need) is logged as ordinary, unclaimed stock — no salesOrderId — which
// then sits in Outbound WH available to any future SO. The full requested
// quantity is still physically moved either way; only the SO-tagging is split.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const locationCode = sanitize(body.locationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const soNumber = sanitize(body.soNumber ?? "");
  const { quantity } = body;

  if (!locationCode || !itemSku || !quantity || quantity <= 0) {
    return NextResponse.json(
      { error: "locationCode, itemSku, and a positive quantity are required" },
      { status: 400 }
    );
  }

  const [sourceLocation] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!sourceLocation) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  if (sourceLocation.type === "OUTBOUND_WH") {
    return NextResponse.json(
      { error: "Barang ini sudah di picking, dan berada di Outbound WH" },
      { status: 409 }
    );
  }

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  let salesOrderId: number | null = null;
  let taggedQty = quantity;
  let untaggedQty = 0;

  if (soNumber) {
    const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
    if (!salesOrder) {
      return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
    }
    if (salesOrder.finishedAt) {
      return NextResponse.json({ error: "This sales order has already been finished" }, { status: 409 });
    }
    salesOrderId = salesOrder.id;

    const [orderLine] = await db
      .select()
      .from(salesOrderItems)
      .where(and(eq(salesOrderItems.salesOrderId, salesOrder.id), eq(salesOrderItems.itemId, item.id)));

    if (orderLine) {
      const currentlyPicked = await getPickedForSoQuantity(db, salesOrder.id, item.id);
      const stillNeeded = Math.max(orderLine.quantity - currentlyPicked, 0);
      taggedQty = Math.min(quantity, stillNeeded);
      untaggedQty = quantity - taggedQty;
    } else {
      // Item isn't even on this SO — none of it can be credited there.
      taggedQty = 0;
      untaggedQty = quantity;
    }
  }

  const allStockHere = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.locationId, sourceLocation.id));

  const matchingRow = allStockHere.find((r) => r.itemId === item.id);
  const occupiedByOther = allStockHere.some((r) => r.itemId !== item.id && r.quantity > 0);

  if (sourceLocation.type === "RACK" && occupiedByOther) {
    return NextResponse.json(
      { error: `${locationCode} is occupied by a different product, not ${itemSku}` },
      { status: 409 }
    );
  }

  const availableAtSource = matchingRow?.quantity ?? 0;
  const sufficient = quantity <= availableAtSource;

  let eventType: "PICKING" | "DEFAULT_PICKING" = "PICKING";

  if (!sufficient) {
    const [settingsRow] = await db.select().from(settings).limit(1);
    if (!settingsRow?.allowDefaultPicking) {
      return NextResponse.json(
        {
          error:
            availableAtSource === 0
              ? `No stock recorded at ${locationCode} for ${itemSku}. Enable Default Picking in Settings to allow this.`
              : `Only ${availableAtSource} of ${itemSku} available at ${locationCode}. Enable Default Picking in Settings to allow taking more.`,
        },
        { status: 409 }
      );
    }
    eventType = "DEFAULT_PICKING";
  }

  const sourceDecrement = Math.min(quantity, Math.max(availableAtSource, 0));

  try {
    await db.transaction(async (tx) => {
      await adjustLocationStock(tx, sourceLocation.id, item.id, -sourceDecrement);
      await adjustLocationStock(tx, outboundWh.id, item.id, quantity);

      if (taggedQty > 0) {
        await tx.insert(locationStockEvents).values({
          type: eventType,
          itemId: item.id,
          sourceLocationId: sourceLocation.id,
          destinationLocationId: outboundWh.id,
          salesOrderId,
          quantity: taggedQty,
          userId: session.userId,
        });
      }

      if (untaggedQty > 0) {
        await tx.insert(locationStockEvents).values({
          type: eventType,
          itemId: item.id,
          sourceLocationId: sourceLocation.id,
          destinationLocationId: outboundWh.id,
          salesOrderId: null,
          quantity: untaggedQty,
          userId: session.userId,
        });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pick";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    locationCode: sourceLocation.code,
    itemSku: item.sku,
    quantityPicked: quantity,
    taggedToSo: taggedQty,
    unclaimed: untaggedQty,
    matchType: eventType === "DEFAULT_PICKING" ? "default_pick" : "exact",
  });
}