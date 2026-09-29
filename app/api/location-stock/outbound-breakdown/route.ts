import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getMarkedBreakdownForItem } from "@/lib/markedStock";

// GET /api/location-stock/outbound-breakdown?sku=...
export async function GET(req: NextRequest) {
  const sku = (req.nextUrl.searchParams.get("sku") ?? "").trim();
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, sku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [outboundWh] = await db.select().from(locations).where(eq(locations.type, "OUTBOUND_WH"));
  if (!outboundWh) {
    return NextResponse.json({ error: "No Outbound Warehouse location exists yet" }, { status: 500 });
  }

  const [stockRows, marked] = await Promise.all([
    db
      .select({ quantity: locationStock.quantity })
      .from(locationStock)
      .where(and(eq(locationStock.locationId, outboundWh.id), eq(locationStock.itemId, item.id))),
    getMarkedBreakdownForItem(db, item.id),
  ]);

  const totalInOutboundWh = stockRows[0]?.quantity ?? 0;
  const unmarked = totalInOutboundWh - marked.totalMarked;

  return NextResponse.json({
    itemSku: item.sku,
    itemName: item.name,
    totalInOutboundWh,
    unmarked,
    markedBySo: marked.bySo,
    markedByTambahan: marked.byTambahan,
  });
}