import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, locationStockEvents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession, hasRole } from "@/lib/auth";

// POST /api/sales-orders/:soNumber/unfinish
// Admin only. Reverses a Finish — deletes the RELEASE events that finish
// created, restoring the SO's earmarked stock to exactly what it was
// before, and clears finishedAt so shipping/picking can resume.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ soNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const isAdmin = await hasRole(session.userId, ["Admin"]);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only admins can undo a finished sales order" }, { status: 403 });
  }

  const { soNumber } = await params;

  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  if (!salesOrder.finishedAt) {
    return NextResponse.json({ error: "This sales order isn't finished" }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(locationStockEvents)
      .where(
        and(eq(locationStockEvents.salesOrderId, salesOrder.id), eq(locationStockEvents.type, "RELEASE"))
      );

    await tx
      .update(salesOrders)
      .set({ finishedAt: null, finishedBy: null })
      .where(eq(salesOrders.id, salesOrder.id));
  });

  return NextResponse.json({ soNumber, unfinished: true });
}