import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameLocations, locationStock, items } from "@/db/schema";
import { eq, and, inArray, isNotNull, isNull, ilike, sql } from "drizzle-orm";

// GET /api/stock-opname/combine
// Lists every stock opname session whose opnameNumber starts with "CSO-"
// (the convention for an individual counter's own section of a combined,
// multi-person opname — e.g. CSO-Budi-01, CSO-Siti-02) along with its
// counted/total line counts, so the Combine CSO panel can offer them for
// selection.
export async function GET() {
  const sessions = await db
    .select()
    .from(stockOpname)
    .where(ilike(stockOpname.opnameNumber, "CSO-%"))
    .orderBy(stockOpname.opnameNumber);

  const opnameNumbers = sessions.map((s) => s.opnameNumber);

  const totalRows =
    opnameNumbers.length > 0
      ? await db
          .select({
            opnameNumber: stockOpnameLocations.opnameNumber,
            total: sql<number>`count(*)`.mapWith(Number),
          })
          .from(stockOpnameLocations)
          .where(inArray(stockOpnameLocations.opnameNumber, opnameNumbers))
          .groupBy(stockOpnameLocations.opnameNumber)
      : [];

  const countedRows =
    opnameNumbers.length > 0
      ? await db
          .select({
            opnameNumber: stockOpnameItems.opnameNumber,
            counted: sql<number>`count(distinct ${stockOpnameItems.locationId})`.mapWith(Number),
          })
          .from(stockOpnameItems)
          .where(inArray(stockOpnameItems.opnameNumber, opnameNumbers))
          .groupBy(stockOpnameItems.opnameNumber)
      : [];

  const totalMap = new Map(totalRows.map((r) => [r.opnameNumber, r.total]));
  const countedMap = new Map(countedRows.map((r) => [r.opnameNumber, r.counted]));

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      opnameNumber: s.opnameNumber,
      notes: s.notes,
      completedAt: s.completedAt,
      totalLines: totalMap.get(s.opnameNumber) ?? 0,
      countedLines: countedMap.get(s.opnameNumber) ?? 0,
    })),
  });
}

function sanitizeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((v) => String(v).trim()).filter(Boolean);
}

// POST /api/stock-opname/combine
// body: { opnameNumbers: string[] }
//
// Sums every counted line's countedQty across the selected sessions, per
// SKU, and checks that combined total against the system's CURRENT total
// stock for that SKU across every location — not just the locations that
// were counted. This is deliberately different from the per-session
// report (which checks location-by-location): this is for several people
// each counting their own section, whose combined counts should add up
// to the whole system's stock once every section is in. Lines with no
// SKU (confirmed-empty locations) don't contribute to any SKU's total —
// their count is surfaced separately as emptyConfirmations instead.
// Read-only — nothing gets changed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const opnameNumbers = sanitizeList(body.opnameNumbers);

  if (opnameNumbers.length === 0) {
    return NextResponse.json({ error: "At least one opnameNumber is required" }, { status: 400 });
  }

  const countedAgg = await db
    .select({
      itemId: stockOpnameItems.itemId,
      combinedQty: sql<number>`sum(${stockOpnameItems.countedQty})`.mapWith(Number),
    })
    .from(stockOpnameItems)
    .where(and(inArray(stockOpnameItems.opnameNumber, opnameNumbers), isNotNull(stockOpnameItems.itemId)))
    .groupBy(stockOpnameItems.itemId);

  const [emptyRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(stockOpnameItems)
    .where(and(inArray(stockOpnameItems.opnameNumber, opnameNumbers), isNull(stockOpnameItems.itemId)));

  const systemAgg = await db
    .select({
      itemId: locationStock.itemId,
      systemQty: sql<number>`sum(${locationStock.quantity})`.mapWith(Number),
    })
    .from(locationStock)
    .groupBy(locationStock.itemId);

  const combinedByItem = new Map(countedAgg.map((r) => [r.itemId as number, r.combinedQty]));
  const systemByItem = new Map(systemAgg.map((r) => [r.itemId, r.systemQty]));

  const allItemIds = Array.from(new Set([...combinedByItem.keys(), ...systemByItem.keys()]));

  const itemRows = allItemIds.length > 0 ? await db.select().from(items).where(inArray(items.id, allItemIds)) : [];
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  const resultItems = allItemIds
    .map((itemId) => {
      const combinedQty = combinedByItem.get(itemId) ?? 0;
      const systemQty = systemByItem.get(itemId) ?? 0;
      const difference = combinedQty - systemQty;
      const item = itemById.get(itemId);
      return {
        itemId,
        itemSku: item?.sku ?? `#${itemId}`,
        itemName: item?.name ?? "(unknown item)",
        combinedQty,
        systemQty,
        difference,
        status: (difference === 0 ? "MATCH" : "MISMATCH") as "MATCH" | "MISMATCH",
      };
    })
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || a.itemSku.localeCompare(b.itemSku));

  const matches = resultItems.filter((i) => i.status === "MATCH").length;

  return NextResponse.json({
    opnameNumbers,
    sessionCount: opnameNumbers.length,
    emptyConfirmations: emptyRow?.count ?? 0,
    items: resultItems,
    summary: {
      totalSkus: resultItems.length,
      matches,
      mismatches: resultItems.length - matches,
      totalCombinedQty: resultItems.reduce((sum, i) => sum + i.combinedQty, 0),
      totalSystemQty: resultItems.reduce((sum, i) => sum + i.systemQty, 0),
    },
  });
}