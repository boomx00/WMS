import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpnameSkus, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { isSkuOpname } from "@/lib/skuOpname";

// Same limit as the Adj field on the Stock Opname Summary (NOTE_MAX_LENGTH).
const MAX_LENGTH = 1000;

function sanitize(input: unknown): string {
  return typeof input === "string" ? input.replace(/\0/g, "").trim() : "";
}

// PATCH /api/stock-opname/summary/adjustment
// body: { opnameNumber, itemId, note }
//
// The Stock Opname Summary's "Adj" field: free text typed for one SKU's
// per-SKU (SOSKU-) opname (e.g. an adjustment reference). It isn't checked
// against anything and doesn't change any stock. An empty note clears it.
//
// Returns { adjustment: { note, at, by } | null }.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const opnameNumber = sanitize(body.opnameNumber);
  const itemId = Number(body.itemId);
  const note = sanitize(body.note);

  if (!opnameNumber || !isSkuOpname(opnameNumber) || !Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "opnameNumber (SOSKU-) and itemId are required" }, { status: 400 });
  }
  if (note.length > MAX_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_LENGTH} characters` }, { status: 400 });
  }

  const [row] = await db
    .select({ id: stockOpnameSkus.id })
    .from(stockOpnameSkus)
    .where(and(eq(stockOpnameSkus.opnameNumber, opnameNumber), eq(stockOpnameSkus.itemId, itemId)));
  if (!row) {
    return NextResponse.json({ error: "This SKU isn't in that opname session" }, { status: 404 });
  }

  if (!note) {
    await db
      .update(stockOpnameSkus)
      .set({ adjustmentNote: null, adjustedAt: null, adjustedBy: null })
      .where(eq(stockOpnameSkus.id, row.id));
    return NextResponse.json({ adjustment: null });
  }

  const now = new Date();
  const [[user]] = await Promise.all([
    db.select({ username: users.username }).from(users).where(eq(users.id, session.userId)),
    db
      .update(stockOpnameSkus)
      .set({ adjustmentNote: note, adjustedAt: now, adjustedBy: session.userId })
      .where(eq(stockOpnameSkus.id, row.id)),
  ]);

  // Same display format as the summary (24-hour, Asia/Jakarta).
  const at = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return NextResponse.json({ adjustment: { note, at, by: user?.username ?? null } });
}