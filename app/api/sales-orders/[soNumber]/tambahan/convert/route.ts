import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, tambahanOrders, locationStockEvents } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// POST /api/sales-orders/:soNumber/tambahan/convert
// body: { newSoNumber, orderDate }
//
// Turns everything picked/shipped under this SO's Tambahan into a normal,
// independent sales order: creates a new sales_orders row with line items
// matching what was picked (by SKU), re-tags every location_stock_events
// row that happened under the Tambahan to point at the new SO instead (so
// its Picking/Shipped history carries over and it shows up correctly
// everywhere else in the system — Sales Orders page, PDA lookups, etc.),
// and marks the Tambahan CONVERTED — kept for history, no longer active.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { soNumber } = await params;
  const body = await req.json();
  const newSoNumber = sanitize(body.newSoNumber ?? "");
  const orderDateInput = body.orderDate;

  if (!newSoNumber || !orderDateInput) {
    return NextResponse.json({ error: "newSoNumber and orderDate are required" }, { status: 400 });
  }

  const [parentSalesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!parentSalesOrder) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  const [tambahan] = await db
    .select()
    .from(tambahanOrders)
    .where(eq(tambahanOrders.parentSalesOrderId, parentSalesOrder.id));

  if (!tambahan) {
    return NextResponse.json({ error: "No Tambahan batch exists for this SO" }, { status: 404 });
  }
  if (tambahan.status === "CONVERTED") {
    return NextResponse.json({ error: `${tambahan.tambahanNumber} was already converted` }, { status: 409 });
  }

  const [clash] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, newSoNumber));
  if (clash) {
    return NextResponse.json({ error: `SO number ${newSoNumber} already exists` }, { status: 409 });
  }

  const pickedRows = await db
    .select({
      itemId: locationStockEvents.itemId,
      picked: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.tambahanOrderId, tambahan.id),
        inArray(locationStockEvents.type, ["PICKING", "DEFAULT_PICKING"])
      )
    )
    .groupBy(locationStockEvents.itemId);

  const lines = pickedRows.filter((r) => r.picked > 0);
  if (lines.length === 0) {
    return NextResponse.json({ error: "Nothing has been picked under this Tambahan yet" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const [newOrder] = await tx
      .insert(salesOrders)
      .values({ soNumber: newSoNumber, orderDate: new Date(orderDateInput) })
      .returning();

    await tx.insert(salesOrderItems).values(
      lines.map((l) => ({
        salesOrderId: newOrder.id,
        itemId: l.itemId,
        quantity: l.picked, // "ordered" qty = what was actually picked under Tambahan
      }))
    );

    // Re-tag every event that happened under the Tambahan onto the new,
    // real SO — its picking/shipping history moves with it, so the new SO
    // immediately shows the correct PICKING/SHIPPED status.
    await tx
      .update(locationStockEvents)
      .set({ salesOrderId: newOrder.id, tambahanOrderId: null })
      .where(eq(locationStockEvents.tambahanOrderId, tambahan.id));

    await tx
      .update(tambahanOrders)
      .set({
        status: "CONVERTED",
        convertedSalesOrderId: newOrder.id,
        convertedAt: new Date(),
        convertedBy: session.userId,
      })
      .where(eq(tambahanOrders.id, tambahan.id));

    return newOrder;
  });

  return NextResponse.json({ newSoNumber: result.soNumber, newSalesOrderId: result.id });
}