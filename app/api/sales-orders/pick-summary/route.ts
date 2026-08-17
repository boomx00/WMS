import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderItems, items, locationStockEvents } from "@/db/schema";
import { eq, and, or, sql, inArray } from "drizzle-orm";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/sales-orders/pick-summary?soNumber=SO1
export async function GET(req: NextRequest) {
    console.log("URL:", req.url);
  console.log("Search params:", req.nextUrl.searchParams.toString());
  console.log(
    "soNumber:",
    req.nextUrl.searchParams.get("soNumber")
  );
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
      itemSku: items.sku,
      itemName: items.name,
      palletCartonQty: items.palletCartonQty,
      orderedQty: salesOrderItems.quantity,
    })
    .from(salesOrderItems)
    .innerJoin(items, eq(salesOrderItems.itemId, items.id))
    .where(eq(salesOrderItems.salesOrderId, salesOrder.id));

  const pickedRows = await db
    .select({
      itemId: locationStockEvents.itemId,
      picked: sql<number>`coalesce(sum(${locationStockEvents.quantity}), 0)::int`,
    })
    .from(locationStockEvents)
    .where(
      and(
        eq(locationStockEvents.salesOrderId, salesOrder.id),
        inArray(locationStockEvents.type, ["PICKING", "DEFAULT_PICKING"])
      )
    )
    .groupBy(locationStockEvents.itemId);

  const pickedMap = new Map(pickedRows.map((r) => [r.itemId, r.picked]));

  const result = lines.map((line) => {
    const picked = pickedMap.get(line.itemId) ?? 0;
    return {
      ...line,
      pickedQty: picked,
      remaining: line.orderedQty - picked,
    };
  });

  return NextResponse.json({ soNumber: salesOrder.soNumber, items: result });
}