import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locations, locationStock, locationStockEvents, locationTypes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getLocationByCode } from "@/lib/locationRules";
import { adjustLoosePacks } from "@/lib/locationStock";

// System Control → Adjust Packs: set the loose packs of a SKU at a packs
// location ("Counted in loose packs" type) directly — for count
// differences or entry mistakes, like Adjust Location does for cartons.
//
// Logged as one ADJUSTMENT ledger row with quantity 0 and loose_packs =
// the signed change (e.g. -2), so carton ledgers stay untouched.
// Covered by the Operations Freeze (lib/operationsFreeze.ts matches
// /api/location-stock/*).

function sanitize(input: unknown): string {
  return String(input ?? "").replace(/\0/g, "").trim();
}

// GET /api/location-stock/adjust-packs?locationCode=&itemSku=
//   → { packLocations: string[], currentPacks: number | null, packsPerCarton: number | null }
// currentPacks/packsPerCarton are null until both fields resolve.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const locationCode = sanitize(req.nextUrl.searchParams.get("locationCode"));
  const itemSku = sanitize(req.nextUrl.searchParams.get("itemSku"));

  const packLocations = (
    await db
      .select({ code: locations.code })
      .from(locations)
      .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
      .where(eq(locationTypes.countsInPacks, true))
      .orderBy(locations.code)
  ).map((l) => l.code);

  let currentPacks: number | null = null;
  let packsPerCarton: number | null = null;
  if (locationCode && itemSku) {
    const [row] = await db
      .select({ loosePacks: locationStock.loosePacks, packsPerCarton: items.cartonBagQty })
      .from(items)
      .leftJoin(locations, eq(locations.code, locationCode))
      .leftJoin(
        locationStock,
        and(eq(locationStock.itemId, items.id), eq(locationStock.locationId, locations.id))
      )
      .where(eq(items.sku, itemSku));
    if (row) {
      currentPacks = row.loosePacks ?? 0;
      packsPerCarton = row.packsPerCarton;
    }
  }

  return NextResponse.json({ packLocations, currentPacks, packsPerCarton });
}

// PATCH /api/location-stock/adjust-packs
// body: { locationCode, itemSku, newPacks, reason? }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "scan.adjustPacks");
  if (denied) return denied;

  const body = await req.json();
  const locationCode = sanitize(body.locationCode);
  const itemSku = sanitize(body.itemSku);
  const reason = sanitize(body.reason);
  const newPacks = Number(body.newPacks);

  if (!locationCode || !itemSku || !Number.isInteger(newPacks) || newPacks < 0) {
    return NextResponse.json(
      { error: "Location, SKU and a whole number of packs (0 or more) are required" },
      { status: 400 }
    );
  }

  const location = await getLocationByCode(db, locationCode);
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }
  if (!location.rules.countsInPacks) {
    return NextResponse.json(
      { error: `${location.code} holds cartons — use Adjust Location for cartons` },
      { status: 400 }
    );
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ loosePacks: locationStock.loosePacks })
        .from(locationStock)
        .where(and(eq(locationStock.locationId, location.id), eq(locationStock.itemId, item.id)));
      const previousPacks = existing?.loosePacks ?? 0;
      const delta = newPacks - previousPacks;
      if (delta === 0) return { previousPacks, delta };

      await adjustLoosePacks(tx, location.id, item.id, delta);
      await tx.insert(locationStockEvents).values({
        type: "ADJUSTMENT",
        itemId: item.id,
        sourceLocationId: null,
        destinationLocationId: location.id,
        quantity: 0,
        loosePacks: delta,
        userId: session.userId,
      });
      return { previousPacks, delta };
    });

    if (result.delta === 0) {
      return NextResponse.json({ error: "New packs are the same as the current packs" }, { status: 400 });
    }

    return NextResponse.json({
      locationCode: location.code,
      itemSku: item.sku,
      previousPacks: result.previousPacks,
      newPacks,
      delta: result.delta,
      reason: reason || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to adjust packs";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
