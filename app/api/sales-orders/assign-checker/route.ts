import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// PATCH /api/sales-orders/assign-checker
// body: { soNumber }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const soNumber = sanitize(body.soNumber ?? "");

  if (!soNumber) {
    return NextResponse.json({ error: "soNumber is required" }, { status: 400 });
  }

  const [order] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!order) {
    return NextResponse.json({ error: "Sales order not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(salesOrders)
    .set({ assignedCheckerId: session.userId })
    .where(eq(salesOrders.id, order.id))
    .returning();

  return NextResponse.json(updated);
}