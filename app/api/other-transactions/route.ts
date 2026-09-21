import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { otherTransactions, locations, items, locationStockEvents, users } from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { adjustLocationStock } from "@/lib/locationStock";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

const PAGE_SIZE = 50;
const MAX_LINES = 200;

type IncomingLine = { locationCode: string; itemSku: string; quantity: number };

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
// body: { type: "INBOUND" | "OUTBOUND", lines: [{ locationCode, itemSku, quantity }], notes? }
// (the old single-row shape { type, locationCode, itemSku, quantity, notes? }
// is still accepted and treated as a one-line batch)
//
// A manual correction outside the normal Inbound/Picking/Shipping flows —
// e.g. defective stock discovered mid-process that needs to be pulled out
// (OUTBOUND) or added back in (INBOUND). Every line gets its own sequential
// ZXCKWMS-<n> code for paperwork/audit purposes.
//
// Like bulk adjustments, every line is resolved and validated BEFORE
// anything is written, and the whole batch runs in one transaction — a bad
// row (unknown location/SKU, outbound below zero) fails the entire batch
// instead of leaving it partially applied.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const type = body.type;
  const notes = body.notes ? sanitize(body.notes) : null;

  if (type !== "INBOUND" && type !== "OUTBOUND") {
    return NextResponse.json({ error: "type must be INBOUND or OUTBOUND" }, { status: 400 });
  }

  const rawLines: unknown[] = Array.isArray(body.lines)
    ? body.lines
    : [{ locationCode: body.locationCode, itemSku: body.itemSku, quantity: body.quantity }];

  const lines: IncomingLine[] = rawLines.map((l) => {
    const line = (l ?? {}) as Record<string, unknown>;
    return {
      locationCode: sanitize(String(line.locationCode ?? "")),
      itemSku: sanitize(String(line.itemSku ?? "")),
      quantity: Number(line.quantity),
    };
  });

  if (lines.length === 0) {
    return NextResponse.json({ error: "At least one line is required" }, { status: 400 });
  }
  if (lines.length > MAX_LINES) {
    return NextResponse.json({ error: `Too many lines (max ${MAX_LINES})` }, { status: 400 });
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.locationCode || !l.itemSku || !Number.isInteger(l.quantity) || l.quantity <= 0) {
      return NextResponse.json(
        {
          error: `Row ${i + 1}: locationCode, itemSku, and a positive whole-number quantity are required`,
        },
        { status: 400 }
      );
    }
  }

  const locationRows = await db
    .select()
    .from(locations)
    .where(inArray(locations.code, Array.from(new Set(lines.map((l) => l.locationCode)))));
  const itemRows = await db
    .select()
    .from(items)
    .where(inArray(items.sku, Array.from(new Set(lines.map((l) => l.itemSku)))));

  const locationByCode = new Map(locationRows.map((l) => [l.code, l]));
  const itemBySku = new Map(itemRows.map((i) => [i.sku, i]));

  const resolved: { line: IncomingLine; location: (typeof locationRows)[number]; item: (typeof itemRows)[number] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const location = locationByCode.get(line.locationCode);
    if (!location) {
      return NextResponse.json(
        { error: `Row ${i + 1}: unknown location code "${line.locationCode}"` },
        { status: 404 }
      );
    }
    const item = itemBySku.get(line.itemSku);
    if (!item) {
      return NextResponse.json(
        { error: `Row ${i + 1}: unknown SKU "${line.itemSku}"` },
        { status: 404 }
      );
    }
    resolved.push({ line, location, item });
  }

  try {
    const results = await db.transaction(async (tx) => {
      const created: { transactionCode: string; itemSku: string; locationCode: string; quantity: number }[] = [];

      for (let i = 0; i < resolved.length; i++) {
        const { line, location, item } = resolved[i];
        const quantity = line.quantity;

        try {
          const [inserted] = await tx
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
            .set({ transactionCode: `ZXCKWMS-${inserted.id}` })
            .where(eq(otherTransactions.id, inserted.id))
            .returning();

          const delta = type === "INBOUND" ? quantity : -quantity;
          // Blocks (throws) if OUTBOUND would take a location below zero.
          // Lines run in order, so repeated location+SKU pairs accumulate.
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

          created.push({
            transactionCode: withCode.transactionCode,
            itemSku: item.sku,
            locationCode: location.code,
            quantity: withCode.quantity,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to record transaction";
          throw new Error(resolved.length > 1 ? `Row ${i + 1}: ${message}` : message);
        }
      }

      return created;
    });

    return NextResponse.json({
      type,
      // transactionCode kept for older single-row callers
      transactionCode: results[0].transactionCode,
      transactionCodes: results.map((r) => r.transactionCode),
      lines: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record transaction";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}