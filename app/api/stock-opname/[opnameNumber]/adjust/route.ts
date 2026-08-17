import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, locationStock, locationStockEvents, locations, items } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";

// POST /api/stock-opname/:opnameNumber/adjust
// Applies every counted line in this (finished) session directly to
// location_stock — computing each row's delta as countedQty minus
// whatever's currently recorded there, so this is safe to run more than
// once (a second run is a no-op for anything already synced). Routes
// through adjustLocationStock, so the one-SKU-per-rack rule and the
// 14-pallet cell cap are still enforced — a row that would violate either
// is skipped and reported, not silently forced through.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname) {
    return NextResponse.json({ error: "Opname session not found" }, { status: 404 });
  }

  if (!opname.completedAt) {
    return NextResponse.json(
      { error: "This session hasn't been finished yet — finish it before adjusting inventory." },
      { status: 409 }
    );
  }

  const countedLines = await db
    .select({
      locationId: stockOpnameItems.locationId,
      itemId: stockOpnameItems.itemId,
      countedQty: stockOpnameItems.countedQty,
      locationCode: locations.code,
      itemSku: items.sku,
    })
    .from(stockOpnameItems)
    .innerJoin(locations, eq(stockOpnameItems.locationId, locations.id))
    .innerJoin(items, eq(stockOpnameItems.itemId, items.id))
    .where(and(eq(stockOpnameItems.opnameNumber, opnameNumber), isNotNull(stockOpnameItems.countedQty)));

  if (countedLines.length === 0) {
    return NextResponse.json({ error: "No counted lines in this session to adjust" }, { status: 400 });
  }

  let applied = 0;
  let skipped = 0;
  const failures: { locationCode: string; itemSku: string; error: string }[] = [];

  for (const line of countedLines) {
    const countedQty = line.countedQty!;

    try {
      const [stockRow] = await db
        .select()
        .from(locationStock)
        .where(and(eq(locationStock.locationId, line.locationId), eq(locationStock.itemId, line.itemId)));

      const currentQty = stockRow?.quantity ?? 0;
      const delta = countedQty - currentQty;

      if (delta === 0) {
        skipped++;
        continue;
      }

      await db.transaction(async (tx) => {
        await adjustLocationStock(tx, line.locationId, line.itemId, delta);

        await tx.insert(locationStockEvents).values({
          type: "ADJUSTMENT",
          itemId: line.itemId,
          sourceLocationId: null,
          destinationLocationId: line.locationId,
          quantity: delta,
          userId: session.userId,
        });
      });

      applied++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to adjust";
      failures.push({ locationCode: line.locationCode, itemSku: line.itemSku, error: message });
    }
  }

  return NextResponse.json({
    opnameNumber,
    totalLines: countedLines.length,
    applied,
    skipped,
    failed: failures.length,
    failures,
  });
}