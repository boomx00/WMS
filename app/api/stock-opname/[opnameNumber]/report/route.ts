import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameLocations, locations, items, users } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const report = allLocations.map((loc) => {
    const counts = countedByLocation.get(loc.locationId) ?? [];
    return {
      locationCode: loc.locationCode,
      counted: counts.length > 0,
      items: counts.map((c) => ({
        itemSku: c.itemSku,
        itemName: c.itemName,
        systemQty: c.systemQty,
        countedQty: c.countedQty,
        difference: c.difference,
        countedAt: c.countedAt,
        countedByUsername: c.countedByUsername,
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