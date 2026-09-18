import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpnameCountEvents, locations, items, users } from "@/db/schema";
import { eq, and, or, isNull, desc } from "drizzle-orm";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// GET /api/stock-opname/:opnameNumber/count-history?locationCode=A.1.1&sku=SKU123
//
// Every individual commit to one location+SKU line, newest first — a full
// Save, an empty-confirmation, or (most commonly on a FLOOR location) a
// single +/- tally tap. This is the "what numbers were actually typed in"
// audit trail behind the current total shown on the report, not the
// current total itself.
//
// `sku` may be omitted/blank to fetch the history of a confirmed-empty
// line at that location (itemId = null), matching how the count endpoint
// itself treats a blank SKU.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const { opnameNumber } = await params;
  const locationCode = sanitize(req.nextUrl.searchParams.get("locationCode") ?? "");
  const rawSku = sanitize(req.nextUrl.searchParams.get("sku") ?? "");

  if (!locationCode) {
    return NextResponse.json({ error: "locationCode is required" }, { status: 400 });
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  let itemId: number | null = null;
  if (rawSku) {
    const label = await normalizeLabel(db, rawSku);
    const sku = extractSku(label);
    if (!sku) {
      return NextResponse.json({ error: "Couldn't parse a SKU" }, { status: 400 });
    }
    const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
    if (!item) {
      return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
    }
    itemId = item.id;
  }

  const rows = await db
    .select({
      delta: stockOpnameCountEvents.delta,
      resultingTotal: stockOpnameCountEvents.resultingTotal,
      createdAt: stockOpnameCountEvents.createdAt,
      username: users.username,
    })
    .from(stockOpnameCountEvents)
    .leftJoin(users, eq(stockOpnameCountEvents.userId, users.id))
    .where(
      and(
        eq(stockOpnameCountEvents.opnameNumber, opnameNumber),
        eq(stockOpnameCountEvents.locationId, location.id),
        itemId ? eq(stockOpnameCountEvents.itemId, itemId) : isNull(stockOpnameCountEvents.itemId)
      )
    )
    .orderBy(desc(stockOpnameCountEvents.createdAt));

  return NextResponse.json(rows);
}