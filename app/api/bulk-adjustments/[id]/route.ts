import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkAdjustments, bulkAdjustmentLines, locations, items, users } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/bulk-adjustments/:id
// Full detail for one bulk adjustment, including every line it touched —
// used to expand a row in the Bulk Adjustments list on the Scan page.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const adjustmentId = Number(id);

  if (Number.isNaN(adjustmentId)) {
    return NextResponse.json({ error: "Invalid adjustment id" }, { status: 400 });
  }

  const [adjustment] = await db.select().from(bulkAdjustments).where(eq(bulkAdjustments.id, adjustmentId));
  if (!adjustment) {
    return NextResponse.json({ error: "Bulk adjustment not found" }, { status: 404 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, adjustment.userId));

  const lines = await db
    .select()
    .from(bulkAdjustmentLines)
    .where(eq(bulkAdjustmentLines.bulkAdjustmentId, adjustmentId));

  const locationIds = Array.from(new Set(lines.map((l) => l.locationId)));
  const itemIds = Array.from(new Set(lines.map((l) => l.itemId)));

  const locationRows = locationIds.length > 0
    ? await db.select().from(locations).where(inArray(locations.id, locationIds))
    : [];
  const itemRows = itemIds.length > 0
    ? await db.select().from(items).where(inArray(items.id, itemIds))
    : [];

  const locationById = new Map(locationRows.map((l) => [l.id, l]));
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  return NextResponse.json({
    id: adjustment.id,
    adjustmentCode: adjustment.adjustmentCode,
    source: adjustment.source,
    description: adjustment.description,
    opnameNumber: adjustment.opnameNumber,
    lineCount: adjustment.lineCount,
    createdAt: adjustment.createdAt,
    username: user?.username ?? null,
    lines: lines.map((l) => ({
      locationCode: locationById.get(l.locationId)?.code ?? `#${l.locationId}`,
      itemSku: itemById.get(l.itemId)?.sku ?? `#${l.itemId}`,
      itemName: itemById.get(l.itemId)?.name ?? null,
      previousQuantity: l.previousQuantity,
      newQuantity: l.newQuantity,
      delta: l.delta,
    })),
  });
}