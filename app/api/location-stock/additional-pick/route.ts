import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, settings, locationStockEvents, locationStock, salesOrders, tambahanOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessPdaAllowed } from "@/lib/pdaPermissions";
import { adjustLocationStock } from "@/lib/locationStock";
import { getLocationByCode, resolvePurposeLocation, isSingleSku } from "@/lib/locationRules";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/additional-pick
// body: { locationCode, itemSku, quantity, soNumber }
//
// Same mechanics as /api/location-stock/pick, but for free-scan "Additional"
// (Tambahan) picking: there's no target quantity to cap against, so the
// full amount is always tagged to the batch (via tambahanOrderId, not
// salesOrderId). Auto-creates the batch for this SO on first pick if it
// doesn't exist yet.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessPdaAllowed(session, "pda.pickTambahan");
  if (denied) return denied;

  const body = await req.json();
  const locationCode = sanitize(body.locationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const soNumber = sanitize(body.soNumber ?? "");
  const { quantity } = body;

  if (!locationCode || !itemSku || !soNumber || !quantity || quantity <= 0) {
    return NextResponse.json(
      { error: "locationCode, itemSku, soNumber, and a positive quantity are required" },
      { status: 400 }
    );
  }

  const sourceLocation = await getLocationByCode(db, locationCode);
  if (!sourceLocation) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  // Already picked: stock in a staging location can't be picked again.
  if (sourceLocation.isStaging) {
    return NextResponse.json(
      { error: `Barang ini sudah di picking, dan berada di ${sourceLocation.code}` },
      { status: 409 }
    );
  }

  // Picks go to the staging location chosen on the PDA (default: Settings → Locations & Marking)
  const staging = await resolvePurposeLocation(db, "staging", body.stagingLocationCode);
  if ("error" in staging) {
    return NextResponse.json({ error: staging.error }, { status: staging.status });
  }
  const outboundWh = staging.location;

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  let [tambahan] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.parentSalesOrderId, salesOrder.id));



  if (!tambahan) {
    [tambahan] = await db
      .insert(tambahanOrders)
      .values({
        tambahanNumber: `TBH-${soNumber}`,
        parentSalesOrderId: salesOrder.id,
        createdBy: session.userId,
      })
      .returning();
  }

  const allStockHere = await db
    .select()
    .from(locationStock)
    .where(eq(locationStock.locationId, sourceLocation.id));

  const matchingRow = allStockHere.find((r) => r.itemId === item.id);
  const occupiedByOther = allStockHere.some((r) => r.itemId !== item.id && r.quantity > 0);

  if (isSingleSku(sourceLocation.rules) && occupiedByOther) {
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

      await tx.insert(locationStockEvents).values({
        type: eventType,
        itemId: item.id,
        sourceLocationId: sourceLocation.id,
        destinationLocationId: outboundWh.id,
        salesOrderId: null,
        tambahanOrderId: tambahan.id,
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
    tambahanNumber: tambahan.tambahanNumber,
    matchType: eventType === "DEFAULT_PICKING" ? "default_pick" : "exact",
  });
}