import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items, salesOrders, salesOrderItems, palletEvents, pallets } from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// GET /api/location-stock/lookup-by-label?label=...&soNumber=...
// Accepts a full pallet label, the literal default barcode, or just a
// bare SKU — all resolve down to the SKU. Reports how much is present in
// Outbound WH, plus (if soNumber given) how much has already shipped
// against that SO for this item.
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

  const availableQty = stockRow?.quantity ?? 0;

const result: Record<string, unknown> = {
  itemSku: item.sku,
  itemName: item.name,
  quantity: availableQty,
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
        const [alreadyShippedRow] = await db
          .select({ total: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int` })
          .from(palletEvents)
          .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
          .where(
            and(
              eq(palletEvents.salesOrderId, salesOrder.id),
              eq(pallets.itemId, item.id),
              eq(palletEvents.type, "OUTBOUND")
            )
          );

        result.orderedQty = orderLine.quantity;
        result.alreadyShipped = alreadyShippedRow?.total ?? 0;
        result.remaining = orderLine.quantity - (alreadyShippedRow?.total ?? 0);
      }
    }
  }

  return NextResponse.json(result);
}