import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items, palletEvents, pallets } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/sales-orders/lookup?soNumber=SO-202608000162
export async function GET(req: NextRequest) {
  const soNumber = sanitize(req.nextUrl.searchParams.get("soNumber") ?? "");

  if (!soNumber) {
    return NextResponse.json({ error: "soNumber is required" }, { status: 400 });
  }

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  const lines = await db
    .select({
      itemId: salesOrderItems.itemId,
      quantity: salesOrderItems.quantity,
      itemSku: items.sku,
      itemName: items.name,
    })
    .from(salesOrderItems)
    .innerJoin(items, eq(salesOrderItems.itemId, items.id))
    .where(eq(salesOrderItems.salesOrderId, salesOrder.id));

  const shippedRows = await db
    .select({
      itemId: pallets.itemId,
      shipped: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
    })
    .from(palletEvents)
    .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
    .where(and(eq(palletEvents.salesOrderId, salesOrder.id), eq(palletEvents.type, "OUTBOUND")))
    .groupBy(pallets.itemId);

  const shippedMap = new Map(shippedRows.map((r) => [r.itemId, r.shipped]));

  const result = lines.map((line) => {
    const shipped = shippedMap.get(line.itemId) ?? 0;
    const status = shipped === 0 ? "PENDING" : shipped >= line.quantity ? "SHIPPED" : "PICKING";
    return { ...line, shipped, remaining: line.quantity - shipped, status };
  });

  return NextResponse.json({
    soNumber: salesOrder.soNumber,
    orderDate: salesOrder.orderDate,
    items: result,
  });
}