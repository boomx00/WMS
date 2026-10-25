import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockColumns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getStockColumns, listStockColumnsWithCounts } from "@/lib/stockColumns";
import { resolveWarehouse } from "@/lib/warehouses";

// PUT /api/stock-columns/order
// body: { warehouseId, ids: [3, 1, 2, ...] } — every column id of that
// warehouse (the default warehouse when warehouseId is left out), in the
// new display order.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "settings.edit", { webOnly: false });
  if (denied) return denied;

  const body = await req.json();
  const ids: unknown = body?.ids;
  const resolved = await resolveWarehouse(db, body?.warehouseId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const warehouseId = resolved.warehouse.id;
  const current = await getStockColumns(db, warehouseId);

  const sameSet =
    Array.isArray(ids) &&
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    current.every((c) => ids.includes(c.id));
  if (!sameSet) {
    return NextResponse.json(
      { error: "The column list changed — refresh and try again" },
      { status: 409 }
    );
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of (ids as number[]).entries()) {
      await tx.update(stockColumns).set({ sortOrder: (index + 1) * 10 }).where(eq(stockColumns.id, id));
    }
  });

  return NextResponse.json(await listStockColumnsWithCounts(db, warehouseId));
}
