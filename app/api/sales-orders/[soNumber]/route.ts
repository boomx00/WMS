import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items, palletEvents, pallets } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/sales-orders/:id
// body: { soNumber, orderDate, items: [{ sku, quantity }] }
// Replaces the sales order's header and line items wholesale. Blocks any
// item's new quantity from dropping below what's already been shipped
// against it, and blocks removing an item entirely if anything has already
// shipped for it.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);

  const [existingOrder] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId));
  if (!existingOrder) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  const body = await req.json();
  const soNumber = sanitize(body.soNumber ?? "");
  const orderDate = body.orderDate;
  const lineItems = Array.isArray(body.items) ? body.items : [];

  if (!soNumber || !orderDate || lineItems.length === 0) {
    return NextResponse.json(
      { error: "soNumber, orderDate, and at least one item are required" },
      { status: 400 }
    );
  }

  // Resolve and merge duplicate SKUs, same as creation.
  const resolvedByItemId = new Map<number, number>();
  for (const line of lineItems) {
    const sku = sanitize(line.sku ?? "");
    if (!sku || !line.quantity || line.quantity <= 0) {
      return NextResponse.json({ error: "Each item needs a sku and a positive quantity" }, { status: 400 });
    }
    const [item] = await db.select().from(items).where(eq(items.sku, sku));
    if (!item) {
      return NextResponse.json({ error: `Unknown SKU: ${sku}` }, { status: 404 });
    }
    resolvedByItemId.set(item.id, (resolvedByItemId.get(item.id) ?? 0) + line.quantity);
  }

  // How much has already shipped, per item, against this SO.
  const shippedRows = await db
    .select({
      itemId: pallets.itemId,
      shipped: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .where(and(eq(palletEvents.salesOrderId, orderId), eq(palletEvents.type, "OUTBOUND")))
    .groupBy(pallets.itemId);

  const shippedMap = new Map(shippedRows.map((r) => [r.itemId, r.shipped]));

  // Guard: any item with shipped > 0 must still be present in the new line
  // items, with a quantity at least as large as what's already shipped.
  for (const [itemId, shipped] of shippedMap.entries()) {
    if (shipped === 0) continue;
    const newQty = resolvedByItemId.get(itemId);
    if (newQty === undefined) {
      return NextResponse.json(
        { error: `Can't remove this item — ${shipped} unit(s) have already shipped against it.` },
        { status: 409 }
      );
    }
    if (newQty < shipped) {
      return NextResponse.json(
        { error: `Can't set quantity below ${shipped} — that's already been shipped for this item.` },
        { status: 409 }
      );
    }
  }

  const resolvedLines = Array.from(resolvedByItemId.entries()).map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }));

  const result = await db.transaction(async (tx) => {
    const [updatedOrder] = await tx
      .update(salesOrders)
      .set({ soNumber, orderDate: new Date(orderDate) })
      .where(eq(salesOrders.id, orderId))
      .returning();

    await tx.delete(salesOrderItems).where(eq(salesOrderItems.salesOrderId, orderId));

    await tx.insert(salesOrderItems).values(
      resolvedLines.map((l) => ({
        salesOrderId: orderId,
        itemId: l.itemId,
        quantity: l.quantity,
      }))
    );

    return updatedOrder;
  });

  return NextResponse.json(result);
}