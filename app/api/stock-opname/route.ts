import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameSkus, locations, items, users } from "@/db/schema";
import { eq, and, isNotNull, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { isSkuOpname } from "@/lib/skuOpname";

// GET /api/stock-opname/sku/:opnameNumber
// Everything about one per-SKU session: each SKU added to it with its LOCKED
// system quantity, how much has been counted in total, and the per-location
// lines behind that (system qty as it stood when each location was counted,
// the counted qty, and the difference — 0 means it matches).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname || !isSkuOpname(opnameNumber)) {
    return NextResponse.json({ error: "SKU opname session not found" }, { status: 404 });
  }

  const skuRows = await db
    .select({
      itemId: stockOpnameSkus.itemId,
      systemQty: stockOpnameSkus.systemQty,
      skuCode: items.sku,
      skuName: items.name,
    })
    .from(stockOpnameSkus)
    .innerJoin(items, eq(stockOpnameSkus.itemId, items.id))
    .where(eq(stockOpnameSkus.opnameNumber, opnameNumber))
    .orderBy(asc(stockOpnameSkus.addedAt), asc(stockOpnameSkus.id));

  const lineRows = await db
    .select({
      itemId: stockOpnameItems.itemId,
      locationCode: locations.code,
      systemQty: stockOpnameItems.systemQty,
      countedQty: stockOpnameItems.countedQty,
      difference: stockOpnameItems.difference,
      countedAt: stockOpnameItems.countedAt,
      countedByUsername: users.username,
    })
    .from(stockOpnameItems)
    .innerJoin(locations, eq(stockOpnameItems.locationId, locations.id))
    .leftJoin(users, eq(stockOpnameItems.countedBy, users.id))
    .where(and(eq(stockOpnameItems.opnameNumber, opnameNumber), isNotNull(stockOpnameItems.itemId)))
    .orderBy(asc(locations.area), asc(locations.x), asc(locations.y), asc(locations.code));

  const linesByItem = new Map<number, typeof lineRows>();
  for (const row of lineRows) {
    if (row.itemId === null) continue;
    if (!linesByItem.has(row.itemId)) linesByItem.set(row.itemId, []);
    linesByItem.get(row.itemId)!.push(row);
  }

  const skus = skuRows.map((s) => {
    const lines = (linesByItem.get(s.itemId) ?? []).map((l) => {
      const countedQty = l.countedQty ?? 0;
      return {
        locationCode: l.locationCode,
        systemQty: l.systemQty,
        countedQty,
        difference: l.difference ?? countedQty - l.systemQty,
        countedAt: l.countedAt,
        countedByUsername: l.countedByUsername,
      };
    });
    const countedQty = lines.reduce((sum, l) => sum + l.countedQty, 0);
    return {
      itemId: s.itemId,
      skuCode: s.skuCode,
      skuName: s.skuName,
      systemQty: s.systemQty,
      countedQty,
      difference: countedQty - s.systemQty,
      lines,
    };
  });

  return NextResponse.json({
    opnameNumber,
    finished: opname.completedAt !== null,
    skus,
  });
}