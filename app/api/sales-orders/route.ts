import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/sales-orders - list all sales orders with their line items
export async function GET() {
  const orders = await db.select().from(salesOrders).orderBy(salesOrders.orderDate);

  const lines = await db
    .select({
      salesOrderId: salesOrderItems.salesOrderId,
      itemId: salesOrderItems.itemId,
      quantity: salesOrderItems.quantity,
      itemSku: items.sku,
      itemName: items.name,
    })
    .from(salesOrderItems)
    .innerJoin(items, eq(salesOrderItems.itemId, items.id));

  const linesByOrder = new Map<number, typeof lines>();
  for (const l of lines) {
    if (!linesByOrder.has(l.salesOrderId)) linesByOrder.set(l.salesOrderId, []);
    linesByOrder.get(l.salesOrderId)!.push(l);
  }

  const result = orders.map((o) => ({
    ...o,
    items: linesByOrder.get(o.id) ?? [],
  }));

  return NextResponse.json(result);
}

// POST /api/sales-orders - create a sales order with line items
// body: { soNumber, orderDate, items: [{ sku, quantity }] }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
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

  // Resolve every SKU up front, before writing anything. Duplicate SKUs
  // (same item listed on more than one line) get merged into a single
  // resolved line with summed quantity, rather than inserted as separate rows.
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
  const resolvedLines = Array.from(resolvedByItemId.entries()).map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }));

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(salesOrders)
      .values({ soNumber, orderDate: new Date(orderDate) })
      .returning();

    await tx.insert(salesOrderItems).values(
      resolvedLines.map((l) => ({
        salesOrderId: order.id,
        itemId: l.itemId,
        quantity: l.quantity,
      }))
    );

    return order;
  });

  return NextResponse.json(result, { status: 201 });
}