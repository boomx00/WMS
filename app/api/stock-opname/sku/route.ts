import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, users } from "@/db/schema";
import { eq, like, desc, sql, inArray, isNotNull, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { SKU_OPNAME_PREFIX } from "@/lib/skuOpname";
import { getSkuOpnameSkus, sessionTotals } from "@/lib/skuOpnameTotals";

// POST /api/stock-opname/sku
// Creates an EMPTY per-SKU stock opname session — SKUs are added to it
// afterwards (POST /api/stock-opname/sku/:opnameNumber/skus), each locking
// its own system quantity at the moment it's added.
// ID format: SOSKU-{username}-{attemptNumber}
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Keep the username portion clean/ID-safe.
  const cleanUsername = user.username.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = `${SKU_OPNAME_PREFIX}${cleanUsername}-`;

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

  await db.insert(stockOpname).values({
    opnameNumber,
    notes: "Per SKU",
    createdBy: session.userId,
    assignedTo: session.userId,
  });

  return NextResponse.json(
    { opnameNumber, skuCount: 0, systemQty: 0, countedQty: 0, status: "PENDING" },
    { status: 201 }
  );
}

// GET /api/stock-opname/sku
// The logged-in user's per-SKU sessions, newest first, with the totals of
// their SKUs — the same numbers as the session's SKU cards: Total Stock
// locations only; systemTotal / countedTotal include loose packs.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const sessions = await db
    .select({ opnameNumber: stockOpname.opnameNumber, completedAt: stockOpname.completedAt })
    .from(stockOpname)
    .where(and(eq(stockOpname.assignedTo, session.userId), like(stockOpname.opnameNumber, `${SKU_OPNAME_PREFIX}%`)))
    .orderBy(desc(stockOpname.createdAt));

  if (sessions.length === 0) return NextResponse.json([]);

  const opnameNumbers = sessions.map((s) => s.opnameNumber);

  // Totals the same as the session's SKU cards (lib/skuOpnameTotals.ts):
  // Total Stock locations only, loose packs included in the *Total fields.
  const skusBySession = await getSkuOpnameSkus(db, opnameNumbers);

  const countedRows = await db
    .select({
      opnameNumber: stockOpnameItems.opnameNumber,
      lineCount: sql<number>`count(*)::int`,
    })
    .from(stockOpnameItems)
    .where(and(inArray(stockOpnameItems.opnameNumber, opnameNumbers), isNotNull(stockOpnameItems.itemId)))
    .groupBy(stockOpnameItems.opnameNumber);
  const countedMap = new Map(countedRows.map((r) => [r.opnameNumber, r]));

  return NextResponse.json(
    sessions.map((s) => {
      const skus = skusBySession.get(s.opnameNumber) ?? [];
      const counted = countedMap.get(s.opnameNumber);
      const status = s.completedAt ? "DONE" : (counted?.lineCount ?? 0) === 0 ? "PENDING" : "IN_PROGRESS";
      // systemQty / countedQty: cartons; systemTotal / countedTotal: with
      // loose packs as cartons (decimal).
      return {
        opnameNumber: s.opnameNumber,
        skuCount: skus.length,
        ...sessionTotals(skus),
        status,
      };
    })
  );
}