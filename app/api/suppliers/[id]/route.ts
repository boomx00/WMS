import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, locationStockEvents, suppliers } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { getSession, isSuperUser } from "@/lib/auth";
import { cleanAttribute } from "@/lib/itemTags";
import { isSupplierKind } from "@/lib/suppliers";

async function managerOnly() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!(await isSuperUser(session.userId))) {
    return NextResponse.json({ error: "Only Manager can edit suppliers" }, { status: 403 });
  }
  return null;
}

// PATCH /api/suppliers/:id — Manager only. body: { name?, kind? }
// The last Production supplier can't become External (production inbound
// is recorded against it).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await managerOnly();
  if (denied) return denied;

  const id = Number((await params).id);
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof suppliers.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = cleanAttribute(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const [clash] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(sql`lower(${suppliers.name}) = lower(${name})`, ne(suppliers.id, id)));
    if (clash) return NextResponse.json({ error: `There is already a supplier called "${name}"` }, { status: 409 });
    updates.name = name;
  }
  if (body.kind !== undefined) {
    if (!isSupplierKind(body.kind)) return NextResponse.json({ error: "Unknown supplier kind" }, { status: 400 });
    if (supplier.kind === "PRODUCTION" && body.kind === "EXTERNAL") {
      const [other] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.kind, "PRODUCTION"), ne(suppliers.id, id)))
        .limit(1);
      if (!other) {
        return NextResponse.json(
          { error: "This is the only Production supplier — production inbound is recorded against it" },
          { status: 409 }
        );
      }
    }
    updates.kind = body.kind;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const [updated] = await db
    .update(suppliers)
    .set(updates)
    .where(eq(suppliers.id, id))
    .returning({ id: suppliers.id, name: suppliers.name, kind: suppliers.kind });
  return NextResponse.json(updated);
}

// DELETE /api/suppliers/:id — Manager only. Not allowed once stock
// movements are recorded against it; its products are left without a
// supplier.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await managerOnly();
  if (denied) return denied;

  const id = Number((await params).id);
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(locationStockEvents)
    .where(eq(locationStockEvents.supplierId, id));
  if (used.n > 0) {
    return NextResponse.json(
      { error: `${supplier.name} has ${used.n.toLocaleString()} stock movement(s) recorded against it, so it can't be deleted` },
      { status: 409 }
    );
  }

  await db.transaction(async (tx) => {
    await tx.update(items).set({ supplierId: null }).where(eq(items.supplierId, id));
    await tx.delete(suppliers).where(eq(suppliers.id, id));
  });
  return NextResponse.json({ ok: true });
}
