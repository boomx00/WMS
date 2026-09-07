import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, bulkAdjustments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// POST /api/stock-opname/:opnameNumber/confirm
// body: { description?, bulkAdjustmentCode? }
//
// A deliberate, web-only confirmation step. It doesn't compute or apply
// any stock changes itself — it just links this session to a bulk
// adjustment that was already created (typically from the Scan page's
// Adjust Bulk tab, covering this session's counted discrepancies) and
// records who confirmed it, when, and why. Confirming always finishes the
// session too — if the PDA already called Finish, that original
// completedAt is kept as-is; otherwise this action IS what finishes it.
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
  const bulkAdjustmentCode = sanitize(body.bulkAdjustmentCode ?? "");

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname) {
    return NextResponse.json({ error: "Opname session not found" }, { status: 404 });
  }

  if (opname.confirmedAt) {
    return NextResponse.json({ error: "This session has already been confirmed" }, { status: 409 });
  }

  let bulkAdjustmentId: number | null = null;
  if (bulkAdjustmentCode) {
    const [adjustment] = await db
      .select()
      .from(bulkAdjustments)
      .where(eq(bulkAdjustments.adjustmentCode, bulkAdjustmentCode));
    if (!adjustment) {
      return NextResponse.json({ error: `Unknown bulk adjustment ID "${bulkAdjustmentCode}"` }, { status: 404 });
    }
    bulkAdjustmentId = adjustment.id;
  }

  const now = new Date();
  const [updated] = await db
    .update(stockOpname)
    .set({
      completedAt: opname.completedAt ?? now,
      confirmedAt: now,
      confirmedBy: session.userId,
      confirmDescription: description || null,
      confirmedBulkAdjustmentId: bulkAdjustmentId,
    })
    .where(eq(stockOpname.opnameNumber, opnameNumber))
    .returning();

  return NextResponse.json({
    opnameNumber,
    confirmedAt: updated.confirmedAt,
    confirmDescription: updated.confirmDescription,
    bulkAdjustmentCode: bulkAdjustmentCode || null,
  });
}