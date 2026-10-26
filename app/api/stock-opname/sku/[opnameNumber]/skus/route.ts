import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameSkus, items, locationStock, locations } from "@/db/schema";
import { eq, and, or, ne } from "drizzle-orm";
import { getSession } from "@/lib/auth";
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