import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameLocations, locations, items, users, locationStock } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/stock-opname/:opnameNumber/report
// The full picture for one session: who it's assigned to, every location
// in scope, and — for each one — whatever's actually been counted there
// so far (SKU, the system quantity as it stood at the moment of that
// count, the counted quantity, and the resulting difference).
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

  // Ground truth: whatever the system's location_stock actually has
  // recorded at each of this session's locations, independent of what was
  // counted. This is what each count is really being checked against.
  const locationIds = allLocations.map((l) => l.locationId);
  const stockRows =
    locationIds.length > 0
      ? await db
          .select({
            locationId: locationStock.locationId,
            itemSku: items.sku,
            quantity: locationStock.quantity,
          })
          .from(locationStock)
          .innerJoin(items, eq(locationStock.itemId, items.id))
          .where(inArray(locationStock.locationId, locationIds))
      : [];

  const systemSkusByLocation = new Map<number, string[]>();
  for (const row of stockRows) {
    if (row.quantity === 0) continue;
    if (!systemSkusByLocation.has(row.locationId)) systemSkusByLocation.set(row.locationId, []);
    systemSkusByLocation.get(row.locationId)!.push(row.itemSku);
  }

  const report = allLocations.map((loc) => {
    const counts = countedByLocation.get(loc.locationId) ?? [];
    const systemSkus = systemSkusByLocation.get(loc.locationId) ?? [];
    const systemSkuAtLocation = systemSkus.length > 0 ? systemSkus.join(", ") : "—";

    return {
      locationCode: loc.locationCode,
      counted: counts.length > 0,
      systemSkuAtLocation,
      items: counts.map((c) => ({
        itemId: c.itemId,
        itemSku: c.itemSku,
        itemName: c.itemName,
        systemQty: c.systemQty,
        countedQty: c.countedQty,
        difference: c.difference,
        countedAt: c.countedAt,
        countedByUsername: c.countedByUsername,
        skuMatch: systemSkus.some((s) => s.toUpperCase() === c.itemSku.toUpperCase())
          ? ("MATCH" as const)
          : ("MISMATCH" as const),
      })),
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