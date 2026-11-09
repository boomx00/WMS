import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locations, locationStock, locationStockEvents, locationTypes, packTransactions, users } from "@/db/schema";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getSession } from "@/lib/auth";
import { getLocationByCode, type LocationWithRules } from "@/lib/locationRules";
import { adjustLocationStock, adjustLoosePacks } from "@/lib/locationStock";

// Loose packs (Other Transactions → Packs).
//
// Packs live only in locations whose type is "Counted in packs" (Locations
// page), in location_stock.loose_packs — their carton quantity is always 0.
//   UNPACK  cartons leave a location (e.g. DEFECT); the good packs inside go
//           to a packs location, the rest are thrown away.
//   REPACK  packs leave the packs location as whole cartons (packs per
//           carton from the Items page) and go into a location.
// Each is one pack_transactions row (PACK-<id>) and two ledger rows: the
// carton side (quantity, loose_packs 0) and the packs side (loose_packs,
// quantity 0) — so every carton ledger and total ignores packs.
// Covered by the Operations Freeze (lib/operationsFreeze.ts matches
// /api/other-transactions/*).

const PAGE_SIZE = 50;

function sanitize(input: unknown): string {
  return String(input ?? "").replace(/\0/g, "").trim();
}

const localDateTime = (column: any) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`;

// GET /api/other-transactions/packs?page=1
//   {
//     packLocations: [{ code, warehouseId }],   // "Counted in packs" locations
//     balances: [{ locationCode, itemSku, itemName, packsPerCarton, loosePacks }],
//     transactions: [{ id, transactionCode, type, itemSku, itemName, cartonLocationCode,
//                      packLocationCode, cartons, packs, damagedPacks, packsPerCarton,
//                      notes, username, createdAt }],
//     page, totalPages
//   }
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const cartonLocation = alias(locations, "carton_location");
  const packLocation = alias(locations, "pack_location");

  const [packLocations, balances, [{ count }], transactions] = await Promise.all([
    db
      .select({ code: locations.code, warehouseId: locations.warehouseId })
      .from(locations)
      .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
      .where(eq(locationTypes.countsInPacks, true))
      .orderBy(asc(locations.code)),
    db
      .select({
        locationCode: locations.code,
        itemSku: items.sku,
        itemName: items.name,
        packsPerCarton: items.cartonBagQty,
        loosePacks: locationStock.loosePacks,
      })
      .from(locationStock)
      .innerJoin(locations, eq(locationStock.locationId, locations.id))
      .innerJoin(items, eq(locationStock.itemId, items.id))
      .where(ne(locationStock.loosePacks, 0))
      .orderBy(asc(items.sku), asc(locations.code)),
    db.select({ count: sql<number>`count(*)::int` }).from(packTransactions),
    db
      .select({
        id: packTransactions.id,
        transactionCode: packTransactions.transactionCode,
        type: packTransactions.type,
        itemSku: items.sku,
        itemName: items.name,
        cartonLocationCode: cartonLocation.code,
        packLocationCode: packLocation.code,
        cartons: packTransactions.cartons,
        packs: packTransactions.packs,
        damagedPacks: packTransactions.damagedPacks,
        packsPerCarton: packTransactions.packsPerCarton,
        notes: packTransactions.notes,
        username: users.username,
        createdAt: localDateTime(packTransactions.createdAt),
      })
      .from(packTransactions)
      .innerJoin(items, eq(packTransactions.itemId, items.id))
      .innerJoin(cartonLocation, eq(packTransactions.cartonLocationId, cartonLocation.id))
      .innerJoin(packLocation, eq(packTransactions.packLocationId, packLocation.id))
      .innerJoin(users, eq(packTransactions.userId, users.id))
      .orderBy(desc(packTransactions.createdAt), desc(packTransactions.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  return NextResponse.json({
    packLocations,
    balances,
    transactions,
    page,
    totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
  });
}

// POST /api/other-transactions/packs
// body: {
//   type: "UNPACK" | "REPACK",
//   itemSku,
//   cartonLocationCode,   // UNPACK: take cartons from here. REPACK: put cartons here.
//   packLocationCode?,    // optional when there's only one packs location in that warehouse
//   cartons,              // whole cartons opened / packed
//   goodPacks?,           // UNPACK only: packs kept (0 .. cartons × packs per carton)
//   notes?
// }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const type = body?.type;
  if (type !== "UNPACK" && type !== "REPACK") {
    return NextResponse.json({ error: "type must be UNPACK or REPACK" }, { status: 400 });
  }

  const itemSku = sanitize(body.itemSku);
  const cartonLocationCode = sanitize(body.cartonLocationCode);
  const packLocationCode = sanitize(body.packLocationCode);
  const notes = sanitize(body.notes) || null;
  const cartons = Number(body.cartons);

  if (!itemSku || !cartonLocationCode) {
    return NextResponse.json({ error: "SKU and location are required" }, { status: 400 });
  }
  if (!Number.isInteger(cartons) || cartons <= 0) {
    return NextResponse.json({ error: "Cartons must be a whole number above 0" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: `Unknown SKU "${itemSku}"` }, { status: 404 });
  }
  const packsPerCarton = item.cartonBagQty;
  if (!Number.isInteger(packsPerCarton) || packsPerCarton <= 0) {
    return NextResponse.json(
      { error: `${item.sku} has no packs per carton set — set it on the Items page first` },
      { status: 400 }
    );
  }

  const cartonLocation = await getLocationByCode(db, cartonLocationCode);
  if (!cartonLocation) {
    return NextResponse.json({ error: `Unknown location "${cartonLocationCode}"` }, { status: 404 });
  }
  if (cartonLocation.rules.countsInPacks) {
    return NextResponse.json(
      { error: `${cartonLocation.code} holds loose packs — choose the location the cartons ${type === "UNPACK" ? "come from" : "go to"}` },
      { status: 400 }
    );
  }
  // Staging stock is picked (and maybe marked for an SO) — not for packing.
  if (cartonLocation.isStaging) {
    return NextResponse.json(
      { error: `${cartonLocation.code} is a Staging location — its stock is picked stock` },
      { status: 400 }
    );
  }

  let packLocation: LocationWithRules | null = null;
  if (packLocationCode) {
    packLocation = await getLocationByCode(db, packLocationCode);
    if (!packLocation) {
      return NextResponse.json({ error: `Unknown location "${packLocationCode}"` }, { status: 404 });
    }
    if (!packLocation.rules.countsInPacks) {
      return NextResponse.json({ error: `${packLocation.code} isn't a packs location` }, { status: 400 });
    }
  } else {
    const candidates = await db
      .select({ code: locations.code })
      .from(locations)
      .innerJoin(locationTypes, eq(locations.type, locationTypes.code))
      .where(and(eq(locationTypes.countsInPacks, true), eq(locations.warehouseId, cartonLocation.warehouseId)));
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "This warehouse has no packs location — add one on the Locations page (a type ticked \"Counted in loose packs\")" },
        { status: 400 }
      );
    }
    if (candidates.length > 1) {
      return NextResponse.json({ error: "This warehouse has more than one packs location — choose one" }, { status: 400 });
    }
    packLocation = await getLocationByCode(db, candidates[0].code);
  }
  if (!packLocation) {
    return NextResponse.json({ error: "Packs location not found" }, { status: 404 });
  }
  if (packLocation.warehouseId !== cartonLocation.warehouseId) {
    return NextResponse.json(
      { error: `${cartonLocation.code} and ${packLocation.code} are in different warehouses` },
      { status: 400 }
    );
  }

  const totalPacks = cartons * packsPerCarton;
  let packs: number;
  let damagedPacks = 0;
  if (type === "UNPACK") {
    packs = Number(body.goodPacks);
    if (!Number.isInteger(packs) || packs < 0 || packs > totalPacks) {
      return NextResponse.json(
        { error: `Good packs must be a whole number from 0 to ${totalPacks} (${cartons} × ${packsPerCarton})` },
        { status: 400 }
      );
    }
    damagedPacks = totalPacks - packs;
  } else {
    packs = totalPacks;
  }

  const cartonLoc = cartonLocation;
  const packLoc = packLocation;

  try {
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(packTransactions)
        .values({
          transactionCode: "PENDING", // fixed up right below
          type,
          itemId: item.id,
          cartonLocationId: cartonLoc.id,
          packLocationId: packLoc.id,
          cartons,
          packs,
          damagedPacks,
          packsPerCarton,
          notes,
          userId: session.userId,
        })
        .returning();
      const transactionCode = `PACK-${created.id}`;
      await tx.update(packTransactions).set({ transactionCode }).where(eq(packTransactions.id, created.id));

      const base = { type, itemId: item.id, userId: session.userId, packTransactionId: created.id };

      if (type === "UNPACK") {
        // Throws if the location doesn't have that many cartons.
        await adjustLocationStock(tx, cartonLoc.id, item.id, -cartons);
        await tx.insert(locationStockEvents).values({
          ...base,
          sourceLocationId: cartonLoc.id,
          destinationLocationId: null,
          quantity: cartons,
          loosePacks: 0,
        });
        if (packs > 0) {
          await adjustLoosePacks(tx, packLoc.id, item.id, packs);
          await tx.insert(locationStockEvents).values({
            ...base,
            sourceLocationId: null,
            destinationLocationId: packLoc.id,
            quantity: 0,
            loosePacks: packs,
          });
        }
      } else {
        // Throws if there aren't enough loose packs.
        await adjustLoosePacks(tx, packLoc.id, item.id, -packs);
        await tx.insert(locationStockEvents).values({
          ...base,
          sourceLocationId: packLoc.id,
          destinationLocationId: null,
          quantity: 0,
          loosePacks: packs,
        });
        // Single-SKU and max-pallet rules of the location still apply.
        await adjustLocationStock(tx, cartonLoc.id, item.id, cartons);
        await tx.insert(locationStockEvents).values({
          ...base,
          sourceLocationId: null,
          destinationLocationId: cartonLoc.id,
          quantity: cartons,
          loosePacks: 0,
        });
      }

      return { transactionCode };
    });

    return NextResponse.json({
      type,
      transactionCode: result.transactionCode,
      itemSku: item.sku,
      cartons,
      packs,
      damagedPacks,
      cartonLocationCode: cartonLoc.code,
      packLocationCode: packLoc.code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
