import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  stockOpname,
  stockOpnameSkus,
  stockOpnameItems,
  stockOpnameCountEvents,
  items,
  locationStock,
  locations,
} from "@/db/schema";
import { eq, and, or, ne } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";
import { SUPER_ROLE_NAME } from "@/lib/roles";
import { normalizeLabel } from "@/lib/labelNormalize";
import { isSkuOpname } from "@/lib/skuOpname";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

function extractSku(label: string): string | null {
  const cleaned = label.replace(/^\*+/, "");
  const parts = cleaned.split("*");
  return parts[0]?.trim() || null;
}

// POST /api/stock-opname/sku/:opnameNumber/skus
// body: { sku }
// Adds one SKU to a per-SKU session. At this moment the SKU's TOTAL system
// quantity (summed across every location in location_stock) is locked onto
// the session and never changes afterwards — later moves, shipments or
// adjustments don't touch it, so the PIC counts against a fixed target.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const rawSku = sanitize(typeof body.sku === "string" ? body.sku : "");
  if (!rawSku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname || !isSkuOpname(opnameNumber)) {
    return NextResponse.json({ error: "SKU opname session not found" }, { status: 404 });
  }
  if (opname.completedAt) {
    return NextResponse.json({ error: "This opname is already finished" }, { status: 409 });
  }

  const label = await normalizeLabel(db, rawSku);
  const sku = extractSku(label);
  if (!sku) {
    return NextResponse.json({ error: "Couldn't parse a SKU" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const [existing] = await db
    .select({ id: stockOpnameSkus.id })
    .from(stockOpnameSkus)
    .where(and(eq(stockOpnameSkus.opnameNumber, opnameNumber), eq(stockOpnameSkus.itemId, item.id)));
  if (existing) {
    return NextResponse.json({ error: `SKU ${item.sku} sudah ada di sesi ini` }, { status: 409 });
  }

  // Lock the system total at this exact moment — and where it is, with
  // each location's warehouse / Total Stock column as they are now (the
  // Stock Opname Summary splits it by column from this).
  const stockRows = await db
    .select({
      locationId: locationStock.locationId,
      qty: locationStock.quantity,
      warehouseId: locations.warehouseId,
      stockColumnId: locations.stockColumnId,
      countsInTotalStock: locations.countsInTotalStock,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locations.id, locationStock.locationId))
    .where(and(eq(locationStock.itemId, item.id), ne(locationStock.quantity, 0)));
  const systemQty = stockRows.reduce((sum, r) => sum + r.qty, 0);

  await db.insert(stockOpnameSkus).values({
    opnameNumber,
    itemId: item.id,
    systemQty,
    addedBy: session.userId,
    columnSnapshot: stockRows,
  });

  return NextResponse.json(
    {
      itemId: item.id,
      skuCode: item.sku,
      skuName: item.name,
      systemQty,
      countedQty: 0,
      difference: -systemQty,
      lines: [],
    },
    { status: 201 }
  );
}

// DELETE /api/stock-opname/sku/:opnameNumber/skus?itemId=N
// Takes one SKU out of a per-SKU session, with everything counted for it
// in that session (its counted lines and count history) and its Adj note.
// Allowed until the session is confirmed (its bulk adjustment is made from
// these counts), for a Manager or the session's PIC (who created it or is
// assigned to it).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;
  const itemId = Number(req.nextUrl.searchParams.get("itemId"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname || !isSkuOpname(opnameNumber)) {
    return NextResponse.json({ error: "SKU opname session not found" }, { status: 404 });
  }
  if (opname.confirmedAt) {
    return NextResponse.json(
      { error: "This session is already confirmed, so its SKUs can't be deleted" },
      { status: 409 }
    );
  }
  const isPic = opname.createdBy === session.userId || opname.assignedTo === session.userId;
  if (!isPic && !(await hasRole(session.userId, [SUPER_ROLE_NAME]))) {
    return NextResponse.json(
      { error: "Only the session's PIC or a Manager can delete its SKUs" },
      { status: 403 }
    );
  }

  const deleted = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(stockOpnameSkus)
      .where(and(eq(stockOpnameSkus.opnameNumber, opnameNumber), eq(stockOpnameSkus.itemId, itemId)))
      .returning({ id: stockOpnameSkus.id });
    if (removed.length === 0) return false;
    await tx
      .delete(stockOpnameItems)
      .where(and(eq(stockOpnameItems.opnameNumber, opnameNumber), eq(stockOpnameItems.itemId, itemId)));
    await tx
      .delete(stockOpnameCountEvents)
      .where(and(eq(stockOpnameCountEvents.opnameNumber, opnameNumber), eq(stockOpnameCountEvents.itemId, itemId)));
    return true;
  });
  if (!deleted) {
    return NextResponse.json({ error: "That SKU isn't in this session" }, { status: 404 });
  }

  return NextResponse.json({ opnameNumber, itemId, deleted: true });
}
