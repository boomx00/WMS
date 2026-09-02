import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameLocations, locations, items, users, locationStock } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/stock-opname/:opnameNumber/report
// The full picture for one session: who it's assigned to, every location
// in scope, and — for each one — whatever's actually been counted there
// so far.
//
// Two distinct "system" comparisons are shown, on purpose:
//   - System SKU / System Qty: read from the snapshot stored on
//     stock_opname_items at count time — a faithful record of what the
//     system believed THEN, unaffected by anything that's happened since
//     (including this session's own Adjust actions). Rows counted before
//     this snapshot existed will show "—" here; that's expected, not a
//     bug — there's no way to retroactively know a past system state.
//   - Current System SKU / Current System Product: a fresh, live lookup
//     of location_stock at report-view time — what's actually there
//     RIGHT NOW, which may differ from the snapshot if anything moved,
//     shipped, or was adjusted since the count was taken.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const { opnameNumber } = await params;

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname) {
    return NextResponse.json({ error: "Opname session not found" }, { status: 404 });
  }

  let assignedToUsername: string | null = null;
  if (opname.assignedTo) {
    const [assignee] = await db.select().from(users).where(eq(users.id, opname.assignedTo));
    assignedToUsername = assignee?.username ?? null;
  }

  const allLocations = await db
    .select({
      locationId: stockOpnameLocations.locationId,
      locationCode: locations.code,
      area: locations.area,
      x: locations.x,
      y: locations.y,
    })
    .from(stockOpnameLocations)
    .innerJoin(locations, eq(stockOpnameLocations.locationId, locations.id))
    .where(eq(stockOpnameLocations.opnameNumber, opnameNumber))
    .orderBy(locations.area, locations.x, locations.y);

  const countedRows = await db
    .select({
      locationId: stockOpnameItems.locationId,
      itemId: stockOpnameItems.itemId,
      itemSku: items.sku,
      itemName: items.name,
      systemQty: stockOpnameItems.systemQty,
      systemSku: stockOpnameItems.systemSku,
      countedQty: stockOpnameItems.countedQty,
      difference: stockOpnameItems.difference,
      countedAt: stockOpnameItems.countedAt,
      countedByUsername: users.username,
    })
    .from(stockOpnameItems)
    .innerJoin(items, eq(stockOpnameItems.itemId, items.id))
    .leftJoin(users, eq(stockOpnameItems.countedBy, users.id))
    .where(eq(stockOpnameItems.opnameNumber, opnameNumber));

  const countedByLocation = new Map<number, typeof countedRows>();
  for (const row of countedRows) {
    if (!countedByLocation.has(row.locationId)) countedByLocation.set(row.locationId, []);
    countedByLocation.get(row.locationId)!.push(row);
  }

  // Live current-system lookup — computed fresh every time this report
  // loads, deliberately independent of the historical snapshot above.
  const locationIds = allLocations.map((l) => l.locationId);
  const liveStockRows =
    locationIds.length > 0
      ? await db
          .select({
            locationId: locationStock.locationId,
            itemSku: items.sku,
            itemName: items.name,
            quantity: locationStock.quantity,
          })
          .from(locationStock)
          .innerJoin(items, eq(locationStock.itemId, items.id))
          .where(inArray(locationStock.locationId, locationIds))
      : [];

  const liveByLocation = new Map<number, { sku: string; name: string }[]>();
  for (const row of liveStockRows) {
    if (row.quantity === 0) continue;
    if (!liveByLocation.has(row.locationId)) liveByLocation.set(row.locationId, []);
    liveByLocation.get(row.locationId)!.push({ sku: row.itemSku, name: row.itemName });
  }

  const report = allLocations.map((loc) => {
    const counts = countedByLocation.get(loc.locationId) ?? [];
    const liveEntries = liveByLocation.get(loc.locationId) ?? [];
    const currentSystemSku = liveEntries.length > 0 ? liveEntries.map((e) => e.sku).join(", ") : "—";
    const currentSystemProductName = liveEntries.length > 0 ? liveEntries.map((e) => e.name).join(", ") : "—";

    return {
      locationCode: loc.locationCode,
      counted: counts.length > 0,
      currentSystemSku,
      currentSystemProductName,
      items: counts.map((c) => {
        const systemSkuList = (c.systemSku ?? "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        return {
          itemId: c.itemId,
          itemSku: c.itemSku,
          itemName: c.itemName,
          systemQty: c.systemQty,
          systemSku: c.systemSku ?? "—",
          countedQty: c.countedQty,
          difference: c.difference,
          countedAt: c.countedAt,
          countedByUsername: c.countedByUsername,
          skuMatch: systemSkuList.includes(c.itemSku.toUpperCase())
            ? ("MATCH" as const)
            : ("MISMATCH" as const),
        };
      }),
    };
  });

  return NextResponse.json({
    opnameNumber: opname.opnameNumber,
    notes: opname.notes,
    assignedToUsername,
    totalLocations: allLocations.length,
    countedLocations: report.filter((r) => r.counted).length,
    report,
  });
}