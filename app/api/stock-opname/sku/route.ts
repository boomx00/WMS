import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, users, items, locationStock } from "@/db/schema";
import { eq, like, desc, or, sql, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// POST /api/stock-opname/sku
// body: { sku }
// Creates a per-SKU stock opname session.
// ID format: SOSKU-{username}-{attemptNumber}
//
// The moment it's created, the SKU's TOTAL system quantity (summed across
// every location in location_stock) is locked onto the session as
// sku_system_qty. It never changes afterwards — later moves, shipments or
// adjustments don't touch it — so the PIC counts against a fixed target.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rawSku = sanitize(typeof body.sku === "string" ? body.sku : "");
  if (!rawSku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const label = await normalizeLabel(db, rawSku);
  const sku = extractSku(label);
  if (!sku) {
    return NextResponse.json({ error: "Couldn't parse a SKU" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Keep the username portion clean/ID-safe.
  const cleanUsername = user.username.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = `SOSKU-${cleanUsername}-`;

  const existingAttempts = await db
    .select({ opnameNumber: stockOpname.opnameNumber })
    .from(stockOpname)
    .where(like(stockOpname.opnameNumber, `${prefix}%`))
    .orderBy(desc(stockOpname.opnameNumber));

  let nextAttempt = 1;
  if (existingAttempts.length > 0) {
    const numbers = existingAttempts
      .map((r) => {
        const suffix = r.opnameNumber.slice(prefix.length);
        const n = parseInt(suffix, 10);
        return isNaN(n) ? 0 : n;
      })
      .filter((n) => n > 0);
    if (numbers.length > 0) {
      nextAttempt = Math.max(...numbers) + 1;
    }
  }

  const opnameNumber = `${prefix}${nextAttempt}`;

  // Lock the system total at this exact moment.
  const [stockRow] = await db
    .select({ total: sql<number>`coalesce(sum(${locationStock.quantity}), 0)::int` })
    .from(locationStock)
    .where(eq(locationStock.itemId, item.id));
  const skuSystemQty = stockRow?.total ?? 0;

  await db.insert(stockOpname).values({
    opnameNumber,
    notes: `Per SKU: ${item.sku}`,
    createdBy: session.userId,
    assignedTo: session.userId,
    skuItemId: item.id,
    skuSystemQty,
  });

  return NextResponse.json(
    {
      opnameNumber,
      skuCode: item.sku,
      skuName: item.name,
      systemQty: skuSystemQty,
      countedQty: 0,
      lineCount: 0,
      status: "PENDING",
    },
    { status: 201 }
  );
}

// GET /api/stock-opname/sku
// The logged-in user's per-SKU sessions, newest first, with the locked
// system quantity and how much has been counted so far.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const sessions = await db
    .select({
      opnameNumber: stockOpname.opnameNumber,
      systemQty: stockOpname.skuSystemQty,
      completedAt: stockOpname.completedAt,
      skuCode: items.sku,
      skuName: items.name,
    })
    .from(stockOpname)
    .innerJoin(items, eq(stockOpname.skuItemId, items.id))
    .where(eq(stockOpname.assignedTo, session.userId))
    .orderBy(desc(stockOpname.createdAt));

  if (sessions.length === 0) return NextResponse.json([]);

  const progressRows = await db
    .select({
      opnameNumber: stockOpnameItems.opnameNumber,
      lineCount: sql<number>`count(*)::int`,
      countedQty: sql<number>`coalesce(sum(${stockOpnameItems.countedQty}), 0)::int`,
    })
    .from(stockOpnameItems)
    .where(inArray(stockOpnameItems.opnameNumber, sessions.map((s) => s.opnameNumber)))
    .groupBy(stockOpnameItems.opnameNumber);

  const progressMap = new Map(progressRows.map((r) => [r.opnameNumber, r]));

  return NextResponse.json(
    sessions.map((s) => {
      const progress = progressMap.get(s.opnameNumber);
      const lineCount = progress?.lineCount ?? 0;
      const status = s.completedAt ? "DONE" : lineCount === 0 ? "PENDING" : "IN_PROGRESS";
      return {
        opnameNumber: s.opnameNumber,
        skuCode: s.skuCode,
        skuName: s.skuName,
        systemQty: s.systemQty ?? 0,
        countedQty: progress?.countedQty ?? 0,
        lineCount,
        status,
      };
    })
  );
}