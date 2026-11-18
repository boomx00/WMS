import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, salesOrders, salesOrderItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { normalizeLabel } from "@/lib/labelNormalize";
import { resolveItemCode } from "@/lib/itemLookup";
import { getOnePdaItemUnits } from "@/lib/pdaRules";
import { getShippedQuantity } from "@/lib/shippedQuantity";
import { getMarkedAt, isMarkingEnabled } from "@/lib/stagingMarks";
import { getUnclaimedQuantity } from "@/lib/unclaimedStock";
import { resolvePurposeLocation } from "@/lib/locationRules";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

export const dynamic = "force-dynamic";

// GET /api/location-stock/lookup-by-label?label=...&soNumber=...&stagingLocationCode=...&expectedSku=...
// Stock of the scanned item in one staging location (default: Settings →
// General): what's unmarked (ecer) there and, with soNumber, how much is
// marked for that SO there (= what can ship from there).
// `label` can be a pallet label, a SKU or a carton barcode — which ones are
// accepted is set in Settings → PDA (lib/itemLookup.ts). expectedSku picks
// the right product when a shared barcode matches several.
export async function GET(req: NextRequest) {
  const rawLabel = sanitize(req.nextUrl.searchParams.get("label") ?? "");
  const soNumber = sanitize(req.nextUrl.searchParams.get("soNumber") ?? "");

  if (!rawLabel) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  const label = await normalizeLabel(db, rawLabel);
  const found = await resolveItemCode(db, label, { expectedSku: req.nextUrl.searchParams.get("expectedSku") });
  if (!found.ok) {
    return NextResponse.json({ error: found.error }, { status: found.status });
  }
  const item = found.item;

  // Stock at the staging location chosen on the PDA (default: Settings → Locations & Marking)
  const staging = await resolvePurposeLocation(db, "staging", req.nextUrl.searchParams.get("stagingLocationCode"));
  if ("error" in staging) {
    return NextResponse.json({ error: staging.error }, { status: staging.status });
  }
  const outboundWh = staging.location;

  const [stockRow] = await db
    .select({ quantity: locationStock.quantity })
    .from(locationStock)
    .where(and(eq(locationStock.locationId, outboundWh.id), eq(locationStock.itemId, item.id)));

  const totalInOutboundWh = stockRow?.quantity ?? 0;
  const unclaimed = await getUnclaimedQuantity(db, item.id, outboundWh.id);

  const result: Record<string, unknown> = {
    itemSku: item.sku,
    itemName: item.name,
    // `quantity` now means the unmarked/unclaimed leftover sitting in
    // this staging location — not the grand total (which includes stock already
    // earmarked to other SOs and thus not meaningfully "available").
    quantity: unclaimed,
    totalInOutboundWh,
    unclaimedInOutboundWh: unclaimed,
    palletCartonQty: item.palletCartonQty,
    units: await getOnePdaItemUnits(db, item.id),
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
        // Marked for this SO in this staging location — nets PICKING,
        // DEFAULT_PICKING, RELEASE, CLAIM, SHIP and marked moves together,
        // so a claim increases what's shippable from here.
        // With order marking off, anything in this location can ship.
        const pickedForSo = (await isMarkingEnabled(db))
          ? await getMarkedAt(db, { salesOrderId: salesOrder.id }, item.id, outboundWh.id)
          : totalInOutboundWh;

        result.orderedQty = orderLine.quantity;
        result.alreadyShipped = alreadyShipped;
        result.remaining = orderLine.quantity - alreadyShipped;
        result.availableToShip = pickedForSo;
      }
    }
  }

  return NextResponse.json(result);
}