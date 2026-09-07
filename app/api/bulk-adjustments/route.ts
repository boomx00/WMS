import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, items, locationStock, locationStockEvents, bulkAdjustments, bulkAdjustmentLines } from "@/db/schema";
import { eq, and, ne, gt } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

type IncomingLine = { locationCode: string; itemSku: string; newQuantity: number };

// POST /api/bulk-adjustments
// body: { lines: [{ locationCode, itemSku, newQuantity }], description? }
//
// The bulk counterpart to /api/location-stock/adjust: instead of one
// location+SKU pair, takes a whole batch at once. Every row directly
// REPLACES whatever's currently recorded for that (location, SKU) pair —
// same "set to X" semantics as the single-row Adjust tab, not a delta —
// and the whole batch is logged together under one generated Adjustment
// ID (bulk_adjustments), so every resulting ADJUSTMENT event can be
// traced back to exactly which bulk submission produced it.
//
// Every line is resolved and validated BEFORE anything is written, so a
// bad row (unknown location/SKU, RACK conflict) fails the entire batch
// rather than leaving it partially applied.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const description = sanitize(body.description ?? "");
  const rawLines: IncomingLine[] = Array.isArray(body.lines) ? body.lines : [];

  if (rawLines.length === 0) {
    return NextResponse.json({ error: "At least one line is required" }, { status: 400 });
  }

  type ResolvedLine = {
    locationId: number;
    locationCode: string;
    itemId: number;
    itemSku: string;
    newQuantity: number;
  };

  const resolved: ResolvedLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const locationCode = sanitize(raw.locationCode ?? "");
    const itemSku = sanitize(raw.itemSku ?? "");
    const newQuantity = Number(raw.newQuantity);

    if (!locationCode || !itemSku || Number.isNaN(newQuantity) || newQuantity < 0) {
      return NextResponse.json(
        { error: `Row ${i + 1}: locationCode, itemSku, and a non-negative newQuantity are required` },
        { status: 400 }
      );
    }

    const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
    if (!location) {
      return NextResponse.json({ error: `Row ${i + 1}: unknown location code "${locationCode}"` }, { status: 404 });
    }

    const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
    if (!item) {
      return NextResponse.json({ error: `Row ${i + 1}: unknown SKU "${itemSku}"` }, { status: 404 });
    }

    if (location.type === "RACK") {
      const [conflict] = await db
        .select()
        .from(locationStock)
        .where(
          and(
            eq(locationStock.locationId, location.id),
            ne(locationStock.itemId, item.id),
            gt(locationStock.quantity, 0)
          )
        )
        .limit(1);
      if (conflict) {
        return NextResponse.json(
          { error: `Row ${i + 1}: ${location.code} already holds a different SKU` },
          { status: 409 }
        );
      }
    }

    resolved.push({
      locationId: location.id,
      locationCode: location.code,
      itemId: item.id,
      itemSku: item.sku,
      newQuantity,
    });
  }

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(bulkAdjustments)
      .values({
        adjustmentCode: "PENDING",
        source: "SCAN",
        description: description || null,
        userId: session.userId,
      })
      .returning();

    const [withCode] = await tx
      .update(bulkAdjustments)
      .set({ adjustmentCode: `BADJ-${created.id}` })
      .where(eq(bulkAdjustments.id, created.id))
      .returning();

    let applied = 0;
    let skipped = 0;
    const appliedLines: {
      locationCode: string;
      itemSku: string;
      previousQuantity: number;
      newQuantity: number;
      delta: number;
    }[] = [];

    for (const line of resolved) {
      const [existing] = await tx
        .select()
        .from(locationStock)
        .where(and(eq(locationStock.locationId, line.locationId), eq(locationStock.itemId, line.itemId)));

      const previousQuantity = existing?.quantity ?? 0;
      const delta = line.newQuantity - previousQuantity;

      if (delta === 0) {
        skipped++;
        continue;
      }

      if (existing) {
        await tx
          .update(locationStock)
          .set({ quantity: line.newQuantity, updatedAt: new Date() })
          .where(eq(locationStock.id, existing.id));
      } else {
        await tx
          .insert(locationStock)
          .values({ locationId: line.locationId, itemId: line.itemId, quantity: line.newQuantity });
      }

      await tx.insert(locationStockEvents).values({
        type: "ADJUSTMENT",
        itemId: line.itemId,
        sourceLocationId: null,
        destinationLocationId: line.locationId,
        quantity: delta,
        userId: session.userId,
        bulkAdjustmentId: withCode.id,
      });

      await tx.insert(bulkAdjustmentLines).values({
        bulkAdjustmentId: withCode.id,
        locationId: line.locationId,
        itemId: line.itemId,
        previousQuantity,
        newQuantity: line.newQuantity,
        delta,
      });

      appliedLines.push({
        locationCode: line.locationCode,
        itemSku: line.itemSku,
        previousQuantity,
        newQuantity: line.newQuantity,
        delta,
      });
      applied++;
    }

    await tx.update(bulkAdjustments).set({ lineCount: applied }).where(eq(bulkAdjustments.id, withCode.id));

    return { adjustmentCode: withCode.adjustmentCode, appliedCount: applied, skippedCount: skipped, lines: appliedLines };
  });

  return NextResponse.json({
    adjustmentCode: result.adjustmentCode,
    description: description || undefined,
    appliedCount: result.appliedCount,
    skippedCount: result.skippedCount,
    lines: result.lines,
  });
}