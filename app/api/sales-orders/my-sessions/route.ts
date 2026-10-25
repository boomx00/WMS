import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, palletEvents, pallets } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const orders = await db
    .select()
    .from(salesOrders)
    .where(eq(salesOrders.assignedCheckerId, session.userId))
    .orderBy(desc(salesOrders.createdAt))
    .limit(5);

  const result = await Promise.all(
    orders.map(async (order) => {
      const lines = await db
        .select({ itemId: salesOrderItems.itemId, quantity: salesOrderItems.quantity })
        .from(salesOrderItems)
        .where(eq(salesOrderItems.salesOrderId, order.id));

      const shippedRows = await db
        .select({
          itemId: pallets.itemId,
          shipped: sql<number>`coalesce(sum(${palletEvents.quantity}), 0)::int`,
        })
        .from(palletEvents)
        .innerJoin(pallets, eq(palletEvents.palletId, pallets.id))
        .where(and(eq(palletEvents.salesOrderId, order.id), eq(palletEvents.type, "OUTBOUND")))
        .groupBy(pallets.itemId);

      const shippedMap = new Map(shippedRows.map((r) => [r.itemId, r.shipped]));

      let anyShipped = false;
      let allDone = true;
      for (const line of lines) {
        const shipped = shippedMap.get(line.itemId) ?? 0;
        if (shipped > 0) anyShipped = true;
        if (shipped < line.quantity) allDone = false;
      }

      const status = allDone ? "DONE" : anyShipped ? "IN_PROGRESS" : "PENDING";

      return {
        soNumber: order.soNumber,
        orderDate: order.orderDate,
        status,
      };
    })
  );

  return NextResponse.json(result);
}