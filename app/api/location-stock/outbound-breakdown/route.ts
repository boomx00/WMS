import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMarkedBreakdownForItem } from "@/lib/markedStock";
import { getStagingTotal } from "@/lib/unclaimedStock";
import { getLocationByCode } from "@/lib/locationRules";
import { getPickOrigins, isMarkingEnabled } from "@/lib/stagingMarks";

// GET /api/location-stock/outbound-breakdown?sku=...&locationCode=...
// Marked (per SO / Tambahan) and unmarked (ecer) stock of an item in one
// staging location, or across every staging location when locationCode is
// left out. Each marked row also says where that stock was picked from
// (pickedFrom), even if it was moved between staging locations since.
// With order marking off nothing is marked: it's all unmarked.
export async function GET(req: NextRequest) {
  const sku = (req.nextUrl.searchParams.get("sku") ?? "").trim();
  const locationCode = (req.nextUrl.searchParams.get("locationCode") ?? "").trim();
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.sku, sku));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  let locationId: number | undefined;
  if (locationCode) {
    const location = await getLocationByCode(db, locationCode);
    if (!location) {
      return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
    }
    if (!location.isStaging) {
      return NextResponse.json({ error: `${location.code} isn't a staging location` }, { status: 400 });
    }
    locationId = location.id;
  }

  const [totalInOutboundWh, marked] = await Promise.all([
    getStagingTotal(db, item.id, locationId),
    getMarkedBreakdownForItem(db, item.id, locationId),
  ]);

  const unmarked = totalInOutboundWh - marked.totalMarked;

  const [markingEnabled, markedBySo, markedByTambahan] = await Promise.all([
    isMarkingEnabled(db),
    Promise.all(
      marked.bySo.map(async (row) => ({
        ...row,
        pickedFrom: await getPickOrigins(db, { salesOrderId: row.salesOrderId }, item.id, locationId),
      }))
    ),
    Promise.all(
      marked.byTambahan.map(async (row) => ({
        ...row,
        pickedFrom: await getPickOrigins(db, { tambahanOrderId: row.tambahanOrderId }, item.id, locationId),
      }))
    ),
  ]);

  return NextResponse.json({
    itemSku: item.sku,
    itemName: item.name,
    locationCode: locationCode || null,
    markingEnabled,
    totalInOutboundWh,
    unmarked,
    markedBySo,
    markedByTambahan,
  });
}
