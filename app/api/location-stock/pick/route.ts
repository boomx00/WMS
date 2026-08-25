import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, settings, locationStockEvents, locationStock, salesOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/pick
// body: { locationCode, itemSku, quantity, soNumber? }
//
// Rules:
//   - RACK occupied by a DIFFERENT SKU → always blocked, setting has no effect
//     (racks are single-SKU by design).
//   - Non-rack locations (Floor, Leftover, Outbound WH) can legitimately
//     hold many SKUs at once — the target SKU simply not being among
//     them yet is NOT a conflict, it falls through to the sufficiency
//     check below like any other shortfall.
//   - Target SKU present with sufficient quantity → always allowed (PICKING).
//   - Target SKU insufficient/absent (on any location type):
//       setting ON  → allowed, source clamped to exactly 0, logged as DEFAULT_PICKING.
//       setting OFF → blocked with a clear insufficient-stock error.
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
  if (soNumber) {
    const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
    if (!salesOrder) {
      return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
    }
    salesOrderId = salesOrder.id;
  }

  const allStockHere = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.locationId, sourceLocation.id));

  const matchingRow = allStockHere.find((r) => r.itemId === item.id);
  const occupiedByOther = allStockHere.some((r) => r.itemId !== item.id && r.quantity > 0);

  // Only RACK cells are single-SKU by design — occupied-by-other is a
  // genuine, unresolvable conflict there and always blocks. Floor,
  // Leftover, and Outbound WH can legitimately hold many SKUs at once,
  // so this check simply doesn't apply to them.
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
  // Default Picking only ever applies to FLOOR — a rack cell must have
  // genuinely sufficient tracked stock, no exceptions, regardless of the
  // setting. Racks are individually-tracked, single-SKU locations, so an
  // insufficient/empty rack reading is a real data problem worth blocking
  // on, not something to silently paper over.
  if (sourceLocation.type !== "FLOOR") {
    return NextResponse.json(
      {
        error:
          availableAtSource === 0
            ? `No stock recorded at ${locationCode} for ${itemSku}. Default Picking is only available from Floor.`
            : `Only ${availableAtSource} of ${itemSku} available at ${locationCode}. Default Picking is only available from Floor.`,
      },
      { status: 409 }
    );
  }

  const [settingsRow] = await db.select().from(settings).limit(1);
  if (!settingsRow?.allowDefaultPicking) {
    return NextResponse.json(
      {
        error: `Only ${availableAtSource} of ${itemSku} available at ${locationCode}. Enable Default Picking in Settings to allow taking more.`,
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

      await tx.insert(locationStockEvents).values({
        type: eventType,
        itemId: item.id,
        sourceLocationId: sourceLocation.id,
        destinationLocationId: outboundWh.id,
        salesOrderId,
        quantity,
        userId: session.userId,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pick";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    locationCode: sourceLocation.code,
    itemSku: item.sku,
    quantityPicked: quantity,
    matchType: eventType === "DEFAULT_PICKING" ? "default_pick" : "exact",
  });
}