import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  salesOrders,
  salesOrderItems,
  pallets,
  palletEvents,
  locationStockEvents,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export async function GET() {
  const orders = await db.select().from(salesOrders);

  const lines = await db
    .select({
      salesOrderId: salesOrderItems.salesOrderId,
      itemId: salesOrderItems.itemId,
      orderedQty: salesOrderItems.quantity,
    })
    .from(salesOrderItems);

  const pickedRows = await db
    .select({
      salesOrderId: locationStockEvents.salesOrderId,
      itemId: locationStockEvents.itemId,
      picked: sql<number>`
        coalesce(sum(${locationStockEvents.quantity}), 0)::int
      `,
    })
    .from(locationStockEvents)
    .where(
      inArray(locationStockEvents.type, [
        "PICKING",
        "DEFAULT_PICKING",
      ])
    )
    .groupBy(
      locationStockEvents.salesOrderId,
      locationStockEvents.itemId
    );

  const shippedRows = await db
    .select({
      salesOrderId: palletEvents.salesOrderId,
      itemId: pallets.itemId,
      shipped: sql<number>`
        coalesce(sum(${palletEvents.quantity}), 0)::int
      `,
    })
    .from(palletEvents)
    .innerJoin(
      pallets,
      eq(palletEvents.palletId, pallets.id)
    )
    .where(eq(palletEvents.type, "OUTBOUND"))
    .groupBy(
      palletEvents.salesOrderId,
      pallets.itemId
    );

  const pickedMap = new Map<string, number>();

  for (const r of pickedRows) {
    if (r.salesOrderId === null) continue;

    pickedMap.set(
      `${r.salesOrderId}-${r.itemId}`,
      r.picked
    );
  }

  const shippedMap = new Map<string, number>();

  for (const r of shippedRows) {
    if (r.salesOrderId === null) continue;

    shippedMap.set(
      `${r.salesOrderId}-${r.itemId}`,
      r.shipped
    );
  }

  const linesByOrder = new Map<number, typeof lines>();

  for (const line of lines) {
    if (!linesByOrder.has(line.salesOrderId)) {
      linesByOrder.set(line.salesOrderId, []);
    }

    linesByOrder
      .get(line.salesOrderId)!
      .push(line);
  }

  const result = orders
    .map((order) => {
      const orderLines =
        linesByOrder.get(order.id) ?? [];

      let anyActivity = false;
      let allDone = orderLines.length > 0;

      for (const line of orderLines) {
        const picked =
          pickedMap.get(
            `${order.id}-${line.itemId}`
          ) ?? 0;

        const shipped =
          shippedMap.get(
            `${order.id}-${line.itemId}`
          ) ?? 0;

        if (picked > 0 || shipped > 0) {
          anyActivity = true;
        }

        if (shipped < line.orderedQty) {
          allDone = false;
        }
      }

      const status = allDone
        ? "DONE"
        : anyActivity
          ? "IN_PROGRESS"
          : "PENDING";

      return {
        soNumber: order.soNumber,
        orderDate: order.orderDate,
        status,
      };
    })
    .filter((order) => order.status !== "DONE")
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "IN_PROGRESS" ? -1 : 1;
      }

      return (
        new Date(b.orderDate).getTime() -
        new Date(a.orderDate).getTime()
      );
    });

  return NextResponse.json(result);
}