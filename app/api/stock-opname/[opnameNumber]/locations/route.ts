import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpnameLocations, stockOpnameItems, locations } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/stock-opname/:opnameNumber/locations
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const { opnameNumber } = await params;

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
    .select({ locationId: stockOpnameItems.locationId })
    .from(stockOpnameItems)
    .where(eq(stockOpnameItems.opnameNumber, opnameNumber));

  const countedSet = new Set(countedRows.map((r) => r.locationId));

  return NextResponse.json(
    allLocations.map((loc) => ({
      locationCode: loc.locationCode,
      done: countedSet.has(loc.locationId),
    }))
  );
}