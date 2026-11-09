import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpnameSkus, stockOpnameItems, stockOpnameLocations, stockOpnameCountEvents, items, locationStock } from "@/db/schema";
import { eq, and, or, inArray, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessPdaAllowed } from "@/lib/pdaPermissions";
import { getLocationByCode, isSingleSku } from "@/lib/locationRules";
import { normalizeLabel } from "@/lib/labelNormalize";
import { isSkuOpname } from "@/lib/skuOpname";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessPdaAllowed(session, "pda.stockOpname");
  if (denied) return denied;

  const { opnameNumber } = await params;
  const body = await req.json();
  const locationCode = sanitize(body.locationCode ?? "");
  const rawScanned = sanitize(body.scanned ?? "");
  const originalLocationCode = sanitize(body.originalLocationCode ?? "");
  const originalRawScanned = sanitize(body.originalSku ?? "");
  // Blank scanned + blank/zero countedQty means "confirmed empty" — a
  // deliberate statement that nothing is here, not a malformed request.
  const isEmptyConfirmation = !rawScanned;
  const countedQty = isEmptyConfirmation ? 0 : Number(body.countedQty);
  // unit: "PACKS" — countedQty is loose packs (sent by the PDA at a packs
  // location, i.e. a "Counted in loose packs" type). Anything else = cartons.
  const sentInPacks = body.unit === "PACKS";

  if (!locationCode) {
    return NextResponse.json({ error: "locationCode is required" }, { status: 400 });
  }
  if (!isEmptyConfirmation && (body.countedQty === undefined || isNaN(countedQty) || countedQty < 0)) {
    return NextResponse.json(
      { error: "scanned and a non-negative countedQty are required (or leave both blank to mark the location empty)" },
      { status: 400 }
    );
  }

  // A per-SKU session (SOSKU-...) only counts the SKUs that were added to it,
  // and can't take an empty-location confirmation (there's no "location"
  // scope to confirm empty).
  const isSkuSession = isSkuOpname(opnameNumber);

  if (isSkuSession && isEmptyConfirmation) {
    return NextResponse.json(
      { error: "This is a per-SKU opname — enter the SKU's quantity for the location (0 if none)." },
      { status: 400 }
    );
  }

  const location = await getLocationByCode(db, locationCode);
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  // Packs locations are counted in loose packs, everything else in cartons.
  // A PDA app from before packs sends no unit — refuse rather than store
  // its carton count as packs. Confirming a location empty needs no unit.
  const inPacks = location.rules.countsInPacks;
  if (inPacks && !sentInPacks && !isEmptyConfirmation) {
    return NextResponse.json(
      { error: `${location.code} is counted in loose packs — wait for the location to load and enter packs (or update the PDA app)` },
      { status: 400 }
    );
  }
  if (!inPacks && sentInPacks) {
    return NextResponse.json({ error: `${location.code} is counted in cartons, not packs` }, { status: 400 });
  }

  let item: typeof items.$inferSelect | null = null;
  if (!isEmptyConfirmation) {
    const label = await normalizeLabel(db, rawScanned);
    const sku = extractSku(label);
    if (!sku) {
      return NextResponse.json({ error: "Couldn't parse a SKU" }, { status: 400 });
    }

    [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
    if (!item) {
      return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
    }

    if (isSkuSession) {
      const [skuRow] = await db
        .select({ id: stockOpnameSkus.id })
        .from(stockOpnameSkus)
        .where(and(eq(stockOpnameSkus.opnameNumber, opnameNumber), eq(stockOpnameSkus.itemId, item.id)));
      if (!skuRow) {
        return NextResponse.json(
          { error: `SKU ${item.sku} belum ditambahkan ke opname ini` },
          { status: 409 }
        );
      }
    }
  }

  // Register this location into the session if it isn't already part of
  // it — this is what makes a custom/real-time session grow as the PIC
  // physically visits places, rather than needing a pre-planned list.
  const [existingLocationLink] = await db
    .select()
    .from(stockOpnameLocations)
    .where(
      and(
        eq(stockOpnameLocations.opnameNumber, opnameNumber),
        eq(stockOpnameLocations.locationId, location.id)
      )
    );

  if (!existingLocationLink) {
    await db.insert(stockOpnameLocations).values({ opnameNumber, locationId: location.id });
  }

  // Snapshot the live system quantity to check the count against. For a
  // normal count that's just this exact location+item. For an empty
  // confirmation there's no single item to compare, so it's the SYSTEM'S
  // TOTAL quantity across every item at the location — if that's nonzero,
  // the resulting difference correctly flags "system expected stock here,
  // PIC found none".
  // At a packs location the same snapshot is taken in loose packs.
  const stockOf = (r: { quantity: number; loosePacks: number }) => (inPacks ? r.loosePacks : r.quantity);
  let systemQty: number;
  if (item) {
    const [stockRow] = await db
      .select()
      .from(locationStock)
      .where(and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, item.id)));
    systemQty = stockRow ? stockOf(stockRow) : 0;
  } else {
    const allStockRows = await db
      .select({ quantity: locationStock.quantity, loosePacks: locationStock.loosePacks })
      .from(locationStock)
      .where(eq(locationStock.locationId, location.id));
    systemQty = allStockRows.reduce((sum, r) => sum + stockOf(r), 0);
  }

  const difference = countedQty - systemQty;

  // Snapshot what the system expected here at this exact moment — the
  // meaning depends on whether a SKU was actually counted:
  //   - Normal count (item present): only THIS item's own snapshot
  //     matters — not every other SKU that happens to share the same
  //     FLOOR cell. If the system had nothing recorded for this exact
  //     item here, systemSku stays null even if other SKUs are present.
  //   - Empty confirmation (item is null — PIC found nothing here):
  //     there's no single item to check against, so this snapshots
  //     EVERY SKU the system had recorded at the location, so the report
  //     can correctly flag "system expected something here, PIC found
  //     nothing" as a mismatch.
  let systemSku: string | null = null;
  if (item) {
    systemSku = systemQty !== 0 ? item.sku : null;
  } else {
    const allStockAtLocation = await db
      .select({ itemId: locationStock.itemId, quantity: locationStock.quantity, loosePacks: locationStock.loosePacks })
      .from(locationStock)
      .where(eq(locationStock.locationId, location.id));

    const nonZeroItemIds = allStockAtLocation.filter((r) => stockOf(r) !== 0).map((r) => r.itemId);
    if (nonZeroItemIds.length > 0) {
      const systemItems = await db.select({ sku: items.sku }).from(items).where(inArray(items.id, nonZeroItemIds));
      systemSku = systemItems.map((i) => i.sku).join(", ") || null;
    }
  }

  const [existingLine] = await db
    .select()
    .from(stockOpnameItems)
    .where(
      and(
        eq(stockOpnameItems.opnameNumber, opnameNumber),
        eq(stockOpnameItems.locationId, location.id),
        item ? eq(stockOpnameItems.itemId, item.id) : isNull(stockOpnameItems.itemId)
      )
    );

  // If this is an edit of an already-saved line, find that original row
  // (by the rack/floor rule above) and, if it isn't the same row we
  // already resolved for the (possibly new) location+item, remove it so
  // the edit doesn't leave a stale duplicate behind.
  if (originalLocationCode) {
    const originalLocation = await getLocationByCode(db, originalLocationCode);

    if (originalLocation) {
      let originalLine;

      if (isSingleSku(originalLocation.rules)) {
        [originalLine] = await db
          .select()
          .from(stockOpnameItems)
          .where(
            and(
              eq(stockOpnameItems.opnameNumber, opnameNumber),
              eq(stockOpnameItems.locationId, originalLocation.id)
            )
          );
      } else if (!originalRawScanned) {
        // Mixed-SKU locations (Floor and other types allowing more than
        // 1 SKU) can hold several SKUs, but
        // an empty confirmation is still unique per location — so if the
        // line being edited WAS an empty confirmation (no original SKU
        // sent), find it the same way regardless of location type.
        [originalLine] = await db
          .select()
          .from(stockOpnameItems)
          .where(
            and(
              eq(stockOpnameItems.opnameNumber, opnameNumber),
              eq(stockOpnameItems.locationId, originalLocation.id),
              isNull(stockOpnameItems.itemId)
            )
          );
      } else if (originalRawScanned) {
        const originalLabel = await normalizeLabel(db, originalRawScanned);
        const originalSku = extractSku(originalLabel);
        if (originalSku) {
          const [originalItem] = await db
            .select()
            .from(items)
            .where(or(eq(items.sku, originalSku), eq(items.legacySku, originalSku)));
          if (originalItem) {
            [originalLine] = await db
              .select()
              .from(stockOpnameItems)
              .where(
                and(
                  eq(stockOpnameItems.opnameNumber, opnameNumber),
                  eq(stockOpnameItems.locationId, originalLocation.id),
                  eq(stockOpnameItems.itemId, originalItem.id)
                )
              );
          }
        }
      }

      if (originalLine && (!existingLine || originalLine.id !== existingLine.id)) {
        await db.delete(stockOpnameItems).where(eq(stockOpnameItems.id, originalLine.id));
      }
    }
  }

  // The location's warehouse / Total Stock column as they are now, kept on
  // the line (first count only) so later settings changes don't rewrite
  // history on the Stock Opname Summary.
  const snapshot = {
    snapshotWarehouseId: location.warehouseId,
    snapshotStockColumnId: location.stockColumnId,
    snapshotCountsInTotal: location.countsInTotalStock,
  };

  // Cartons go in systemQty / countedQty / difference, loose packs in the
  // *_packs columns — the other unit's columns are 0 on the line.
  const figures = inPacks
    ? {
        countsInPacks: true,
        systemQty: 0,
        countedQty: 0,
        difference: 0,
        systemPacks: systemQty,
        countedPacks: countedQty,
        differencePacks: difference,
      }
    : {
        countsInPacks: false,
        systemQty,
        countedQty,
        difference,
        systemPacks: 0,
        countedPacks: null,
        differencePacks: 0,
      };

  let result;
  const previousQty = (existingLine?.countsInPacks ? existingLine.countedPacks : existingLine?.countedQty) ?? 0;
  if (existingLine) {
    [result] = await db
      .update(stockOpnameItems)
      .set({
        ...figures,
        systemSku,
        countedAt: new Date(),
        countedBy: session.userId,
        ...(existingLine.snapshotWarehouseId === null ? snapshot : {}),
      })
      .where(eq(stockOpnameItems.id, existingLine.id))
      .returning();
  } else {
    [result] = await db
      .insert(stockOpnameItems)
      .values({
        opnameNumber,
        locationId: location.id,
        itemId: item?.id ?? null,
        ...figures,
        systemSku,
        countedAt: new Date(),
        countedBy: session.userId,
        ...snapshot,
      })
      .returning();
  }

  // Log this commit as a history event — but only when it actually changed
  // the total. Re-saving an unchanged value (e.g. tapping into a line and
  // out again without editing) isn't something worth showing in the
  // "what was typed in" history.
  const delta = countedQty - previousQty;
  if (delta !== 0) {
    await db.insert(stockOpnameCountEvents).values({
      opnameNumber,
      locationId: location.id,
      itemId: item?.id ?? null,
      delta,
      resultingTotal: countedQty,
      countsInPacks: inPacks,
      userId: session.userId,
    });
  }

  return NextResponse.json({
    ...result,
    // In the line's unit (loose packs at a packs location).
    systemQty,
    countedQty,
    difference,
    unit: inPacks ? "PACKS" : "CARTON",
    itemSku: item?.sku ?? null,
    itemName: item?.name ?? null,
    locationCode: location.code,
  });
}