import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { otherTransactions, locations, items, locationStockEvents, users } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

const PAGE_SIZE = 50;

// GET /api/other-transactions?type=INBOUND|OUTBOUND&page=1
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);

  if (type !== "INBOUND" && type !== "OUTBOUND") {
    return NextResponse.json({ error: "type must be INBOUND or OUTBOUND" }, { status: 400 });
  }

  const offset = (page - 1) * PAGE_SIZE;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(otherTransactions)
    .where(eq(otherTransactions.type, type));

  const rows = await db
    .select({
      id: otherTransactions.id,
      transactionCode: otherTransactions.transactionCode,
      quantity: otherTransactions.quantity,
      notes: otherTransactions.notes,
      createdAt: otherTransactions.createdAt,
      itemSku: items.sku,
      itemName: items.name,
      locationCode: locations.code,
      username: users.username,
    })
    .from(otherTransactions)
    .innerJoin(items, eq(otherTransactions.itemId, items.id))
    .innerJoin(locations, eq(otherTransactions.locationId, locations.id))
    .innerJoin(users, eq(otherTransactions.userId, users.id))
    .where(eq(otherTransactions.type, type))
    .orderBy(desc(otherTransactions.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  return NextResponse.json({
    transactions: rows,
    page,
    totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    totalCount: count,
  });
}

// POST /api/other-transactions
// body: { type: "INBOUND" | "OUTBOUND", locationCode, itemSku, quantity, notes? }
//
// A manual correction outside the normal Inbound/Picking/Shipping flows —
// e.g. defective stock discovered mid-process that needs to be pulled out
// (OUTBOUND) or added back in (INBOUND). Every transaction gets its own
// sequential ZXCKWMS-<n> code for paperwork/audit purposes.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const type = body.type;
  const locationCode = sanitize(body.locationCode ?? "");
  const itemSku = sanitize(body.itemSku ?? "");
  const notes = body.notes ? sanitize(body.notes) : null;
  const { quantity } = body;

  if (type !== "INBOUND" && type !== "OUTBOUND") {
    return NextResponse.json({ error: "type must be INBOUND or OUTBOUND" }, { status: 400 });
  }
  if (!locationCode || !itemSku || !quantity || quantity <= 0) {
    return NextResponse.json(
      { error: "locationCode, itemSku, and a positive quantity are required" },
      { status: 400 }
    );
  }

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, itemSku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(otherTransactions)
        .values({
          transactionCode: "PENDING", // fixed up below once we have the real id
          type,
          itemId: item.id,
          locationId: location.id,
          quantity,
          notes,
          userId: session.userId,
        })
        .returning();

      const [withCode] = await tx
        .update(otherTransactions)
        .set({ transactionCode: `ZXCKWMS-${created.id}` })
        .where(eq(otherTransactions.id, created.id))
        .returning();

      const delta = type === "INBOUND" ? quantity : -quantity;
      // Blocks (throws) if OUTBOUND would take a location below zero.
      await adjustLocationStock(tx, location.id, item.id, delta);

      await tx.insert(locationStockEvents).values({
        type: type === "INBOUND" ? "OTHER_INBOUND" : "OTHER_OUTBOUND",
        itemId: item.id,
        sourceLocationId: type === "OUTBOUND" ? location.id : null,
        destinationLocationId: type === "INBOUND" ? location.id : null,
        otherTransactionId: withCode.id,
        quantity,
        userId: session.userId,
      });

      return withCode;
    });

    return NextResponse.json({
      transactionCode: result.transactionCode,
      type: result.type,
      itemSku: item.sku,
      locationCode: location.code,
      quantity: result.quantity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record transaction";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}