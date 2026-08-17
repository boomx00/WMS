import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, locations, items } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/stock-opname/:opnameNumber
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const { opnameNumber } = await params;

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname) {
    return NextResponse.json({ error: "Opname session not found" }, { status: 404 });
  }

  const lines = await db
    .select({
      id: stockOpnameItems.id,
      locationCode: locations.code,
      itemSku: items.sku,
      itemName: items.name,
      systemQty: stockOpnameItems.systemQty,
      countedQty: stockOpnameItems.countedQty,
      difference: stockOpnameItems.difference,
      countedAt: stockOpnameItems.countedAt,
    })
    .from(stockOpnameItems)
    .innerJoin(locations, eq(stockOpnameItems.locationId, locations.id))
    .innerJoin(items, eq(stockOpnameItems.itemId, items.id))
    .where(eq(stockOpnameItems.opnameNumber, opnameNumber))
    .orderBy(locations.code);

  return NextResponse.json({ ...opname, lines });
}