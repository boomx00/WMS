import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locations, locationStock, salesOrders, tambahanOrders } from "@/db/schema";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getMarkedLocations, getPickOrigins, isMarkingEnabled, type OrderRef } from "@/lib/stagingMarks";

// GET /api/sales-orders/:soNumber/staging?sku=...&tambahan=true
// Where this SO (or, with tambahan=true, its Tambahan batch) can ship one
// SKU from — what the PDA's ship screens offer:
//   marking on:  the staging locations holding stock marked for it, with
//                the marked quantity and where it was picked from
//   marking off: every staging location holding the SKU, with its stock
//   { markingEnabled, locations: [{ code, quantity, pickedFrom }] }  (largest first)
export async function GET(req: NextRequest, { params }: { params: Promise<{ soNumber: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { soNumber } = await params;
  const sku = (req.nextUrl.searchParams.get("sku") ?? "").replace(/\0/g, "").trim();
  const forTambahan = req.nextUrl.searchParams.get("tambahan") === "true";
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  const [item] = await db.select().from(items).where(or(eq(items.sku, sku), eq(items.legacySku, sku)));
  if (!item) {
    return NextResponse.json({ error: "Unknown SKU" }, { status: 404 });
  }

  const markingEnabled = await isMarkingEnabled(db);
  const sortRows = (rows: { code: string; quantity: number; pickedFrom: string[] }[]) =>
    rows.sort((a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code));

  if (!markingEnabled) {
    // Shared pool: any staging location holding the SKU.
    const rows = await db
      .select({ code: locations.code, quantity: locationStock.quantity })
      .from(locationStock)
      .innerJoin(locations, eq(locations.id, locationStock.locationId))
      .where(and(eq(locationStock.itemId, item.id), eq(locations.isStaging, true), gt(locationStock.quantity, 0)));
    return NextResponse.json({
      markingEnabled,
      locations: sortRows(rows.map((r) => ({ ...r, pickedFrom: [] }))),
    });
  }

  let order: OrderRef = { salesOrderId: salesOrder.id };
  if (forTambahan) {
    const [tambahan] = await db
      .select()
      .from(tambahanOrders)
      .where(eq(tambahanOrders.parentSalesOrderId, salesOrder.id));
    if (!tambahan) {
      return NextResponse.json({ markingEnabled, locations: [] });
    }
    order = { tambahanOrderId: tambahan.id };
  }

  const marked = [...(await getMarkedLocations(db, order, item.id))].filter(([, qty]) => qty > 0);
  if (marked.length === 0) {
    return NextResponse.json({ markingEnabled, locations: [] });
  }

  const rows = await db
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(inArray(locations.id, marked.map(([id]) => id)));
  const codeById = new Map(rows.map((r) => [r.id, r.code]));

  const result = await Promise.all(
    marked.map(async ([id, qty]) => ({
      code: codeById.get(id) ?? "?",
      quantity: qty,
      pickedFrom: await getPickOrigins(db, order, item.id, id),
    }))
  );

  return NextResponse.json({ markingEnabled, locations: sortRows(result) });
}
