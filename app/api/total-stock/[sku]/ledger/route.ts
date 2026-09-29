import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locationStock, locationStockEvents, locations, users, salesOrders, tambahanOrders } from "@/db/schema";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getLedgerStartAt, parseDateParam, formatUtcDateTime, totalDelta } from "@/lib/ledger";

export const dynamic = "force-dynamic";

const sourceLoc = alias(locations, "source_loc");
const destLoc = alias(locations, "dest_loc");

// GET /api/total-stock/:sku/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const fromParam = parseDateParam(req.nextUrl.searchParams.get("from"));
  const toParam = parseDateParam(req.nextUrl.searchParams.get("to"));
  const toExclusive = toParam ? new Date(toParam.getTime() + 24 * 60 * 60 * 1000) : null;
  const ledgerStartAt = await getLedgerStartAt();

  const [item] = await db.select().from(items).where(eq(items.sku, sku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [totalRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${locationStock.quantity}), 0)::int` })
    .from(locationStock)
    .where(eq(locationStock.itemId, item.id));
  const liveTotal = totalRow?.total ?? 0;

  const events = await db
    .select({
      id: locationStockEvents.id,
      type: locationStockEvents.type,
      quantity: locationStockEvents.quantity,
      sourceCode: sourceLoc.code,
      destinationCode: destLoc.code,
      soNumber: salesOrders.soNumber,
      tambahanNumber: tambahanOrders.tambahanNumber,
      username: users.username,
      createdAtRaw: locationStockEvents.createdAt,
      createdAt: sql<string>`to_char(${locationStockEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`,
    })
    .from(locationStockEvents)
    .leftJoin(sourceLoc, eq(locationStockEvents.sourceLocationId, sourceLoc.id))
    .leftJoin(destLoc, eq(locationStockEvents.destinationLocationId, destLoc.id))
    .leftJoin(salesOrders, eq(locationStockEvents.salesOrderId, salesOrders.id))
    .leftJoin(tambahanOrders, eq(locationStockEvents.tambahanOrderId, tambahanOrders.id))
    .innerJoin(users, eq(locationStockEvents.userId, users.id))
    .where(and(eq(locationStockEvents.itemId, item.id), gte(locationStockEvents.createdAt, ledgerStartAt)))
    .orderBy(asc(locationStockEvents.createdAt), asc(locationStockEvents.id));

  const netSinceStart = events.reduce(
    (sum, ev) => sum + totalDelta(ev.sourceCode != null, ev.destinationCode != null, ev.quantity),
    0
  );
  const startBalance = liveTotal - netSinceStart;

  const truncated = Boolean(fromParam && fromParam < ledgerStartAt);
  const effectiveFrom = fromParam && fromParam > ledgerStartAt ? fromParam : ledgerStartAt;

  let running = startBalance;
  let openingBalance = startBalance;
  const entries: {
    id: number;
    type: string;
    quantity: number;
    sourceCode: string | null;
    destinationCode: string | null;
    soNumber: string | null;
    tambahanNumber: string | null;
    username: string;
    createdAt: string;
    delta: number;
    runningTotal: number;
  }[] = [];

  for (const ev of events) {
    const delta = totalDelta(ev.sourceCode != null, ev.destinationCode != null, ev.quantity);
    running += delta;

    if (ev.createdAtRaw < effectiveFrom) {
      openingBalance = running;
    } else if (!toExclusive || ev.createdAtRaw < toExclusive) {
      const { createdAtRaw, ...rest } = ev;
      entries.push({ ...rest, delta, runningTotal: running });
    }
  }

  return NextResponse.json({
    sku: item.sku,
    name: item.name,
    anchorOpeningQuantity: startBalance,
    anchorOpeningAt: formatUtcDateTime(ledgerStartAt),
    truncated,
    rangeFrom: formatUtcDateTime(effectiveFrom),
    rangeTo: toParam ? formatUtcDateTime(toParam) : null,
    openingBalance,
    closingBalance: running,
    entries,
  });
}