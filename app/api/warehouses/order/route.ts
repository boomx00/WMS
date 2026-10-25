import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { warehouses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getWarehouses, listWarehousesWithCounts } from "@/lib/warehouses";

// PUT /api/warehouses/order
// body: { ids: [2, 1, ...] } — every warehouse id, in the new display order
// (Total Stock tabs, PDA list). The first active one is the default warehouse.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locations.edit");
  if (denied) return denied;

  const body = await req.json();
  const ids: unknown = body?.ids;
  const current = await getWarehouses(db);

  const sameSet =
    Array.isArray(ids) &&
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    current.every((w) => ids.includes(w.id));
  if (!sameSet) {
    return NextResponse.json({ error: "The warehouse list changed — refresh and try again" }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of (ids as number[]).entries()) {
      await tx.update(warehouses).set({ sortOrder: (index + 1) * 10 }).where(eq(warehouses.id, id));
    }
  });

  return NextResponse.json(await listWarehousesWithCounts(db));
}
