import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locations, tambahanOrders, locationStockEvents } from "@/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { adjustLocationStock } from "@/lib/locationStock";
import { getMarkedLocations } from "@/lib/stagingMarks";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/location-stock/outbound-breakdown/return-tambahan
// body: { itemSku, tambahanNumber, mode: "ECER" | "ORIGINAL_LOCATION" }
//
// Releases whatever is currently outstanding (picked-but-unshipped) for
// this SKU under this Tambahan, in every staging location it's marked in.
// Two modes:
//
//   ECER — pure ledger reattribution, no physical stock movement. Logs a
//   negative CLAIM tagged to this Tambahan in each staging location, which
//   both (a) reduces this Tambahan's marked stock there, and (b) is picked
//   up by getUnclaimedQuantity's residual calc automatically — the
//   released amount becomes unmarked (ecer) stock in that same location,
//   with nothing to reconcile by hand.
//
//   ORIGINAL_LOCATION — physically moves the outstanding quantity back
//   from the staging locations to wherever it was actually picked from, walking
//   this Tambahan's own PICKING/DEFAULT_PICKING history for this item in
//   reverse order (most recent pick reversed first) until the
//   outstanding amount is fully covered. Each reversal is logged as a
//   negative-quantity PICKING event with the same source/destination
//   pairing as the original pick — this both physically moves the stock
//   back (via adjustLocationStock) and naturally reduces the Tambahan's
//   marked total, using the same signed-quantity convention RELEASE/CLAIM
//   already use elsewhere in the ledger.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "so.tambahan");
  if (denied) return denied;

  const body = await req.json();
  const itemSku = sanitize(body.itemSku ?? "");
  const tambahanNumber = sanitize(body.tambahanNumber ?? "");
  const mode = body.mode;

  if (!itemSku || !tambahanNumber || (mode !== "ECER" && mode !== "ORIGINAL_LOCATION")) {
    return NextResponse.json(
      { error: "itemSku, tambahanNumber, and mode ('ECER' or 'ORIGINAL_LOCATION') are required" },
      { status: 400 }
    );
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [tambahan] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.tambahanNumber, tambahanNumber));
  if (!tambahan) {
    return NextResponse.json({ error: "Unknown Tambahan number" }, { status: 404 });
  }

  // Where this Tambahan's stock of the item is marked now (staging
  // location id -> quantity), positive amounts only.
  const markedAt = new Map(
    [...(await getMarkedLocations(db, { tambahanOrderId: tambahan.id }, item.id))].filter(([, q]) => q > 0)
  );
  const outstanding = [...markedAt.values()].reduce((sum, q) => sum + q, 0);
  if (outstanding <= 0) {
    return NextResponse.json({ error: "Nothing outstanding for this SKU under this Tambahan" }, { status: 400 });
  }

  const stagingRows = await db.select().from(locations).where(inArray(locations.id, [...markedAt.keys()]));
  const stagingCodeById = new Map(stagingRows.map((l) => [l.id, l.code]));

  if (mode === "ECER") {
    await db.transaction(async (tx) => {
      for (const [stagingLocationId, amount] of markedAt) {
        await tx.insert(locationStockEvents).values({
          type: "CLAIM",
          itemId: item.id,
          sourceLocationId: stagingLocationId,
          destinationLocationId: stagingLocationId,
          salesOrderId: null,
          tambahanOrderId: tambahan.id,
          quantity: -amount,
          userId: session.userId,
        });
      }
    });

    return NextResponse.json({
      mode,
      itemSku,
      released: outstanding,
      destination: [...markedAt.keys()].map((id) => `${stagingCodeById.get(id) ?? "?"} (ecer)`).join(", "),
    });
  }

  // ORIGINAL_LOCATION — each reversal comes out of a staging location
  // that still holds this Tambahan's marked stock: the one the pick went
  // into if it still has some there, otherwise any other (the stock may
  // have been moved between staging locations since).
  const markedLeft = new Map(markedAt);
  const drawFrom = (preferredId: number | null, wanted: number): { stagingLocationId: number; amount: number }[] => {
    const order = [
      ...(preferredId !== null && markedLeft.has(preferredId) ? [preferredId] : []),
      ...[...markedLeft.keys()].filter((id) => id !== preferredId),
    ];
    const parts: { stagingLocationId: number; amount: number }[] = [];
    for (const id of order) {
      if (wanted <= 0) break;
      const available = markedLeft.get(id) ?? 0;
      const take = Math.min(available, wanted);
      if (take <= 0) continue;
      markedLeft.set(id, available - take);
      parts.push({ stagingLocationId: id, amount: take });
      wanted -= take;
    }
    return parts;
  };

  // Original pick events for this item under this Tambahan, most recent
  // first — only positive-quantity PICKING/DEFAULT_PICKING rows (a prior
  // reversal would already be a negative-quantity row of the same type,
  // excluded here so it can't be "un-reversed" a second time).
  const pickEvents = await db
    .select({
      id: locationStockEvents.id,
      sourceLocationId: locationStockEvents.sourceLocationId,
      destinationLocationId: locationStockEvents.destinationLocationId,
      quantity: locationStockEvents.quantity,
    })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahan.id),
        eq(locationStockEvents.itemId, item.id),
        sql`${locationStockEvents.type} IN ('PICKING', 'DEFAULT_PICKING')`,
        sql`${locationStockEvents.quantity} > 0`
      )
    )
    .orderBy(desc(locationStockEvents.createdAt));

  let remaining = outstanding;
  const allocations: { sourceLocationId: number; stagingLocationId: number; amount: number }[] = [];

  for (const ev of pickEvents) {
    if (remaining <= 0) break;
    if (!ev.sourceLocationId) continue;
    const take = Math.min(remaining, ev.quantity);
    if (take <= 0) continue;
    for (const part of drawFrom(ev.destinationLocationId, take)) {
      allocations.push({ sourceLocationId: ev.sourceLocationId, ...part });
      remaining -= part.amount;
    }
  }

  if (remaining > 0) {
    return NextResponse.json(
      {
        error: `Could only trace ${outstanding - remaining} of ${outstanding} back to a specific pick location — the rest has no recorded source (likely from a manual correction, not an actual pick). Use "kembalikan ke ecer" instead, or resolve the remainder manually.`,
      },
      { status: 409 }
    );
  }

  // Merge allocations by (pick location, staging location) in case the
  // same location was picked from more than once, so we log one clean
  // event per pair rather than several fragments.
  const byPair = new Map<string, { sourceLocationId: number; stagingLocationId: number; amount: number }>();
  for (const a of allocations) {
    const key = `${a.sourceLocationId}:${a.stagingLocationId}`;
    const existing = byPair.get(key);
    if (existing) existing.amount += a.amount;
    else byPair.set(key, { ...a });
  }
  const byLocation = new Map<number, number>();
  for (const a of byPair.values()) {
    byLocation.set(a.sourceLocationId, (byLocation.get(a.sourceLocationId) ?? 0) + a.amount);
  }

  const locationRows = await db
    .select()
    .from(locations)
    .where(inArray(locations.id, Array.from(byLocation.keys())));
  const codeById = new Map(locationRows.map((l) => [l.id, l.code]));

  await db.transaction(async (tx) => {
    for (const { sourceLocationId, stagingLocationId, amount } of byPair.values()) {
      await adjustLocationStock(tx, sourceLocationId, item.id, amount);
      await adjustLocationStock(tx, stagingLocationId, item.id, -amount);

      await tx.insert(locationStockEvents).values({
        type: "PICKING",
        itemId: item.id,
        sourceLocationId,
        destinationLocationId: stagingLocationId,
        salesOrderId: null,
        tambahanOrderId: tambahan.id,
        quantity: -amount,
        userId: session.userId,
      });
    }
  });

  return NextResponse.json({
    mode,
    itemSku,
    released: outstanding,
    destinations: Array.from(byLocation.entries()).map(([id, amount]) => ({
      locationCode: codeById.get(id) ?? "?",
      amount,
    })),
  });
}