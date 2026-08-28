import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items, salesOrders, salesOrderItems } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { normalizeLabel } from "@/lib/labelNormalize";
import { getShippedQuantity } from "@/lib/shippedQuantity";
import { getPickedForSoQuantity } from "@/lib/pickedForSo";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// GET /api/location-stock/lookup-by-label?label=...&soNumber=...
export async function GET(req: NextRequest) {
  const rawLabel = sanitize(req.nextUrl.searchParams.get("label") ?? "");
  const soNumber = sanitize(req.nextUrl.searchParams.get("soNumber") ?? "");

  if (!rawLabel) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  const label = await normalizeLabel(db, rawLabel);
  const sku = extractSku(label);

  if (!sku) {
    return NextResponse.json({ error: "Couldn't parse a SKU" }, { status: 400 });
  }

  const [item] = await db
    .select()
    .from(items)
    .where(or(eq(items.sku, sku), eq(items.legacySku, sku)));

  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  const [stockRow] = await db
    .select({ quantity: locationStock.quantity })
    .from(locationStock)
    .where(and(eq(locationStock.locationId, outboundWh.id), eq(locationStock.itemId, item.id)));

  const totalInOutboundWh = stockRow?.quantity ?? 0;
  const unclaimed = await getUnclaimedQuantity(db, item.id);

  const result: Record<string, unknown> = {
    itemSku: item.sku,
    itemName: item.name,
    // `quantity` now means the unmarked/unclaimed leftover sitting in
    // Outbound WH — not the grand total (which includes stock already
    // earmarked to other SOs and thus not meaningfully "available").
    quantity: unclaimed,
    totalInOutboundWh,
    unclaimedInOutboundWh: unclaimed,
    palletCartonQty: item.palletCartonQty,
  };

  if (soNumber) {
    const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
    if (salesOrder) {
      const [orderLine] = await db
        .select()
        .from(salesOrderItems)
        .where(and(eq(salesOrderItems.salesOrderId, salesOrder.id), eq(salesOrderItems.itemId, item.id)));

      if (orderLine) {
        const alreadyShipped = await getShippedQuantity(db, salesOrder.id, item.id);
        // Uses the SHARED helper — correctly nets PICKING, DEFAULT_PICKING,
        // RELEASE, and CLAIM together, so a claim actually reduces what
        // still needs claiming and increases what's shippable.
        const pickedForSo = await getPickedForSoQuantity(db, salesOrder.id, item.id);

        result.orderedQty = orderLine.quantity;
        result.alreadyShipped = alreadyShipped;
        result.remaining = orderLine.quantity - alreadyShipped;
        result.availableToShip = pickedForSo;
      }
    }
  }

  return NextResponse.json(result);
}