import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  stockOpname,
  stockOpnameItems,
  locationStock,
  locationStockEvents,
  bulkAdjustments,
  bulkAdjustmentLines,
} from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// POST /api/stock-opname/:opnameNumber/confirm
// body: { description?, attachBulkAdjustment?: boolean }
//
// A deliberate, web-only gate on top of the PDA's "Finish Stock Opname"
// action. A session can only be confirmed once it's DONE (PIC finished
// counting) and hasn't already been confirmed. Optionally, confirming
// also applies every remaining counted discrepancy to system stock in
// one shot — same mechanics as the existing per-session Adjust action —
// but wrapped in its own bulk_adjustments record (with an Adjustment ID
// and this confirmation's description) instead of loose, untracked
// ADJUSTMENT events. Deltas are recomputed against LIVE location_stock at
// confirm time, not the count-time snapshot, since stock may have moved
// since the count was taken.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const description = sanitize(body.description ?? "");
  const attachBulkAdjustment = body.attachBulkAdjustment !== false;

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname) {
    return NextResponse.json({ error: "Opname session not found" }, { status: 404 });
  }


  if (opname.confirmedAt) {
    return NextResponse.json({ error: "This session has already been confirmed" }, { status: 409 });
  }

  let bulkAdjustmentSummary: {
    adjustmentCode: string;
    applied: number;
    skipped: number;
    failed: number;
    failures: { locationId: number; itemId: number; error: string }[];
  } | null = null;

  await db.transaction(async (tx) => {
    let bulkAdjustmentId: number | null = null;

    if (attachBulkAdjustment) {
      const [created] = await tx
        .insert(bulkAdjustments)
        .values({
          adjustmentCode: "PENDING",
          source: "STOCK_OPNAME",
          description: description || null,
          opnameNumber,
          userId: session.userId,
        })
        .returning();

      const [withCode] = await tx
        .update(bulkAdjustments)
        .set({ adjustmentCode: `OPADJ-${created.id}` })
        .where(eq(bulkAdjustments.id, created.id))
        .returning();

      bulkAdjustmentId = withCode.id;

      const lines = await tx
        .select()
        .from(stockOpnameItems)
        .where(and(eq(stockOpnameItems.opnameNumber, opnameNumber), isNotNull(stockOpnameItems.countedQty)));

      let applied = 0;
      let skipped = 0;
      let failed = 0;
      const failures: { locationId: number; itemId: number; error: string }[] = [];

      for (const line of lines) {
        if (line.countedQty === null) continue;

        const [stockRow] = await tx
          .select()
          .from(locationStock)
          .where(and(eq(locationStock.locationId, line.locationId), eq(locationStock.itemId, line.itemId)));

        const currentQty = stockRow?.quantity ?? 0;
        const delta = line.countedQty - currentQty;

        if (delta === 0) {
          skipped++;
          continue;
        }

        try {
          await adjustLocationStock(tx, line.locationId, line.itemId, delta);

          await tx.insert(locationStockEvents).values({
            type: "ADJUSTMENT",
            itemId: line.itemId,
            sourceLocationId: null,
            destinationLocationId: line.locationId,
            quantity: delta,
            userId: session.userId,
            bulkAdjustmentId,
          });

          await tx.insert(bulkAdjustmentLines).values({
            bulkAdjustmentId: bulkAdjustmentId!,
            locationId: line.locationId,
            itemId: line.itemId,
            previousQuantity: currentQty,
            newQuantity: line.countedQty,
            delta,
          });

          applied++;
        } catch (err) {
          failed++;
          failures.push({
            locationId: line.locationId,
            itemId: line.itemId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      await tx.update(bulkAdjustments).set({ lineCount: applied }).where(eq(bulkAdjustments.id, bulkAdjustmentId));

      bulkAdjustmentSummary = { adjustmentCode: withCode.adjustmentCode, applied, skipped, failed, failures };
    }

    const now = new Date();
    await tx
      .update(stockOpname)
      .set({
        // Confirming always finishes the session too. If the PDA already
        // called Finish, that original completedAt is kept as-is — web
        // confirm just adds the confirmation layer on top. If it hasn't,
        // this confirm action IS what finishes it.
        completedAt: opname.completedAt ?? now,
        confirmedAt: now,
        confirmedBy: session.userId,
        confirmDescription: description || null,
        confirmedBulkAdjustmentId: bulkAdjustmentId,
      })
      .where(eq(stockOpname.opnameNumber, opnameNumber));
  });

  return NextResponse.json({
    opnameNumber,
    confirmedAt: new Date().toISOString(),
    confirmDescription: description || null,
    bulkAdjustment: bulkAdjustmentSummary,
  });
}