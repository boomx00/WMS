import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameLocations, locationStock, items, locations, users } from "@/db/schema";
import { eq, and, inArray, isNotNull, isNull, ilike, sql, desc } from "drizzle-orm";

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
    .orderBy(desc(stockOpname.createdAt));

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

type CountedEntry = {
  opnameNumber: string;
  countedQty: number;
  countedAt: string | null;
  countedByUsername: string | null;
};

// POST /api/stock-opname/combine
// body: { opnameNumbers: string[] }
//
// Combines counts across the selected sessions PER LOCATION first, not
// just per SKU — because the same physical location can legitimately be
// counted by more than one CSO session. If every session that counted a
// given location agrees on the quantity, that location contributes its
// quantity ONCE to the SKU's combined total (not once per session — two
// sessions agreeing on 500 is still 500, not 1000). If sessions disagree
// on a location's quantity, that location is left UNRESOLVED (contributes
// nothing to the default total) and flagged for the person to pick which
// session's count to trust — the frontend does that selection and
// recomputes the total client-side; this endpoint always reports the
// default (conflicts excluded) state. Read-only — nothing gets changed.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const opnameNumbers = sanitizeList(body.opnameNumbers);

  if (opnameNumbers.length === 0) {
    return NextResponse.json({ error: "At least one opnameNumber is required" }, { status: 400 });
  }

  const [emptyRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(stockOpnameItems)
    .where(and(inArray(stockOpnameItems.opnameNumber, opnameNumbers), isNull(stockOpnameItems.itemId)));

  // Every counted (location, item) line across the selected sessions.
  const countedLineRows = await db
    .select({
      itemId: stockOpnameItems.itemId,
      opnameNumber: stockOpnameItems.opnameNumber,
      locationCode: locations.code,
      countedQty: stockOpnameItems.countedQty,
      countedAt: stockOpnameItems.countedAt,
      countedByUsername: users.username,
    })
    .from(stockOpnameItems)
    .innerJoin(locations, eq(stockOpnameItems.locationId, locations.id))
    .leftJoin(users, eq(stockOpnameItems.countedBy, users.id))
    .where(and(inArray(stockOpnameItems.opnameNumber, opnameNumbers), isNotNull(stockOpnameItems.itemId)));

  // item -> location -> every session's count at that location
  const rawByItemLocation = new Map<number, Map<string, CountedEntry[]>>();
  for (const row of countedLineRows) {
    const itemId = row.itemId as number;
    if (!rawByItemLocation.has(itemId)) rawByItemLocation.set(itemId, new Map());
    const byLoc = rawByItemLocation.get(itemId)!;
    if (!byLoc.has(row.locationCode)) byLoc.set(row.locationCode, []);
    byLoc.get(row.locationCode)!.push({
      opnameNumber: row.opnameNumber,
      countedQty: row.countedQty ?? 0,
      countedAt: row.countedAt ? row.countedAt.toISOString() : null,
      countedByUsername: row.countedByUsername,
    });
  }

  // Total system quantity per item, across every location — the figure
  // the combined count is ultimately checked against.
  const systemAgg = await db
    .select({
      itemId: locationStock.itemId,
      systemQty: sql<number>`sum(${locationStock.quantity})`.mapWith(Number),
    })
    .from(locationStock)
    .groupBy(locationStock.itemId);
  const systemByItem = new Map(systemAgg.map((r) => [r.itemId, r.systemQty]));

  // Live system quantity per item, broken down by location — for the
  // side-by-side detail view.
  const allItemIds = Array.from(new Set([...rawByItemLocation.keys(), ...systemByItem.keys()]));

  const systemLocationRows =
    allItemIds.length > 0
      ? await db
          .select({
            itemId: locationStock.itemId,
            locationCode: locations.code,
            quantity: locationStock.quantity,
          })
          .from(locationStock)
          .innerJoin(locations, eq(locationStock.locationId, locations.id))
          .where(inArray(locationStock.itemId, allItemIds))
      : [];

  const systemByItemLocation = new Map<number, Map<string, number>>();
  for (const row of systemLocationRows) {
    if (row.quantity === 0) continue;
    if (!systemByItemLocation.has(row.itemId)) systemByItemLocation.set(row.itemId, new Map());
    systemByItemLocation.get(row.itemId)!.set(row.locationCode, row.quantity);
  }

  const itemRows = allItemIds.length > 0 ? await db.select().from(items).where(inArray(items.id, allItemIds)) : [];
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  function buildBreakdownForItem(itemId: number) {
    const countedMap = rawByItemLocation.get(itemId) ?? new Map<string, CountedEntry[]>();
    const systemMap = systemByItemLocation.get(itemId) ?? new Map<string, number>();
    const allCodes = Array.from(new Set([...countedMap.keys(), ...systemMap.keys()])).sort((a, b) =>
      a.localeCompare(b)
    );

    let hasConflict = false;
    let combinedQty = 0;

    const locationBreakdown = allCodes.map((locationCode) => {
      const entries = (countedMap.get(locationCode) ?? []).sort((a, b) => a.opnameNumber.localeCompare(b.opnameNumber));
      const systemQty = systemMap.has(locationCode) ? systemMap.get(locationCode)! : null;

      let resolvedQty: number | null = null;
      let conflict = false;

      if (entries.length > 0) {
        const distinctQtys = new Set(entries.map((e) => e.countedQty));
        if (distinctQtys.size === 1) {
          resolvedQty = entries[0].countedQty;
        } else {
          conflict = true;
          hasConflict = true;
        }
      }

      if (resolvedQty !== null) combinedQty += resolvedQty;

      return { locationCode, systemQty, entries, resolvedQty, conflict };
    });

    return { locationBreakdown, combinedQty, hasConflict };
  }

  const resultItems = allItemIds
    .map((itemId) => {
      const { locationBreakdown, combinedQty, hasConflict } = buildBreakdownForItem(itemId);
      const systemQty = systemByItem.get(itemId) ?? 0;
      const difference = combinedQty - systemQty;
      const item = itemById.get(itemId);
      const status: "MATCH" | "MISMATCH" | "NEEDS_REVIEW" = hasConflict
        ? "NEEDS_REVIEW"
        : difference === 0
          ? "MATCH"
          : "MISMATCH";
      return {
        itemId,
        itemSku: item?.sku ?? `#${itemId}`,
        itemName: item?.name ?? "(unknown item)",
        combinedQty,
        systemQty,
        difference,
        status,
        hasConflict,
        locationBreakdown,
      };
    })
    .sort((a, b) => {
      if (a.hasConflict !== b.hasConflict) return a.hasConflict ? -1 : 1;
      return Math.abs(b.difference) - Math.abs(a.difference) || a.itemSku.localeCompare(b.itemSku);
    });

  const matches = resultItems.filter((i) => i.status === "MATCH").length;
  const needsReview = resultItems.filter((i) => i.status === "NEEDS_REVIEW").length;

  return NextResponse.json({
    opnameNumbers,
    sessionCount: opnameNumbers.length,
    emptyConfirmations: emptyRow?.count ?? 0,
    items: resultItems,
    summary: {
      totalSkus: resultItems.length,
      matches,
      mismatches: resultItems.length - matches - needsReview,
      needsReview,
      totalCombinedQty: resultItems.reduce((sum, i) => sum + i.combinedQty, 0),
      totalSystemQty: resultItems.reduce((sum, i) => sum + i.systemQty, 0),
    },
  });
}