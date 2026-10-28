import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hasRole } from "@/lib/auth";
import { SUPER_ROLE_NAME } from "@/lib/roles";
import { deleteSalesOrder, planSalesOrderDeletion } from "@/lib/deleteSalesOrder";

async function managerOnly() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
  const isManager = await hasRole(session.userId, [SUPER_ROLE_NAME]);
  if (!isManager) {
    return { error: NextResponse.json({ error: "Only Manager can delete sales orders" }, { status: 403 }) };
  }
  return { session };
}

// GET /api/sales-orders/:soNumber/delete
// Manager only. What deleting this SO would put back on FLOOR (nothing is
// changed): { soNumber, floor, lines: [{ sku, name, kind: "staged" | "shipped",
// fromLocationCode, quantity, short }] }
export async function GET(_req: NextRequest, { params }: { params: Promise<{ soNumber: string }> }) {
  const auth = await managerOnly();
  if ("error" in auth) return auth.error;

  const { soNumber } = await params;
  const plan = await planSalesOrderDeletion(db, soNumber);
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: plan.status });

  return NextResponse.json({
    soNumber: plan.salesOrder.soNumber,
    finished: plan.salesOrder.finishedAt !== null,
    floor: plan.floor.code,
    lines: plan.lines.map(({ fromLocationId: _id, ...l }) => l),
  });
}

// POST /api/sales-orders/:soNumber/delete
// Manager only. Deletes the SO: its staged and shipped stock goes back to
// FLOOR as DELETE_SO events (lib/deleteSalesOrder.ts).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ soNumber: string }> }) {
  const auth = await managerOnly();
  if ("error" in auth) return auth.error;

  const { soNumber } = await params;
  const plan = await planSalesOrderDeletion(db, soNumber);
  if ("error" in plan) return NextResponse.json({ error: plan.error }, { status: plan.status });

  try {
    await deleteSalesOrder(db, plan, auth.session.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete the sales order";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({
    soNumber,
    deleted: true,
    returnedToFloor: plan.lines.reduce((n, l) => n + l.quantity, 0),
  });
}
