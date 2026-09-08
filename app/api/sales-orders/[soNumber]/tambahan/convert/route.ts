import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, tambahanOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// POST /api/sales-orders/:soNumber/tambahan/convert
// body: { newSoNumber }
//
// Purely a labeling action — records the real SO number that was
// eventually issued on paper for this Tambahan batch. Does NOT create a
// new sales_orders row, does NOT touch sales_order_items, does NOT
// re-tag any location_stock_events, and does NOT touch location_stock.
// Every pick and ship that happened under this Tambahan stays exactly
// where it is, still queryable by tambahanOrderId — this just stamps the
// batch with the number it ultimately became on paper.
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

  if (!newSoNumber) {
    return NextResponse.json({ error: "newSoNumber is required" }, { status: 400 });
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
    return NextResponse.json(
      { error: `Already converted to ${tambahan.convertedSoNumber}` },
      { status: 409 }
    );
  }

  // Avoid confusion with a real, separately-existing sales order.
  const [clash] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, newSoNumber));
  if (clash) {
    return NextResponse.json(
      { error: `${newSoNumber} already exists as a real, separate sales order — this action just labels the Tambahan, it can't link to an existing SO's own data.` },
      { status: 409 }
    );
  }

  const [updated] = await db
    .update(tambahanOrders)
    .set({
      status: "CONVERTED",
      convertedSoNumber: newSoNumber,
      convertedAt: new Date(),
      convertedBy: session.userId,
    })
    .where(eq(tambahanOrders.id, tambahan.id))
    .returning();

  return NextResponse.json({ tambahanNumber: updated.tambahanNumber, convertedSoNumber: updated.convertedSoNumber });
}