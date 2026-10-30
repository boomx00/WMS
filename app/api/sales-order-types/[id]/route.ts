import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, salesOrderTypes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { cleanNumberPrefix, cleanTypeDescription, cleanTypeName, typeNameTaken } from "@/lib/salesOrderTypes";

async function guard(params: Promise<{ id: string }>) {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
  }
  const denied = await denyUnlessAllowed(session, "so.types");
  if (denied) return { response: denied };

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return { response: NextResponse.json({ error: "Invalid type id" }, { status: 400 }) };
  }
  const [type] = await db.select().from(salesOrderTypes).where(eq(salesOrderTypes.id, id));
  if (!type) {
    return { response: NextResponse.json({ error: "Sales order type not found" }, { status: 404 }) };
  }
  return { type };
}

// PATCH /api/sales-order-types/:id
// body: { name, description?, numberPrefix? } — renaming changes it on
// every sales order of this type (they point at the type, not its name).
// Changing the prefix only affects SOs created afterwards; existing SO
// numbers are never rewritten.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await guard(params);
  if ("response" in result) return result.response;
  const { type } = result;

  const body = await req.json().catch(() => ({}));
  const name = cleanTypeName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (await typeNameTaken(db, name, type.id)) {
    return NextResponse.json({ error: `There is already a type called "${name}"` }, { status: 409 });
  }

  const [updated] = await db
    .update(salesOrderTypes)
    .set({
      name,
      description: cleanTypeDescription(body?.description),
      numberPrefix: cleanNumberPrefix(body?.numberPrefix),
    })
    .where(eq(salesOrderTypes.id, type.id))
    .returning();

  return NextResponse.json(updated);
}

// DELETE /api/sales-order-types/:id — only while no sales order uses it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await guard(params);
  if ("response" in result) return result.response;
  const { type } = result;

  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(salesOrders)
    .where(eq(salesOrders.salesOrderTypeId, type.id));
  if (used.n > 0) {
    return NextResponse.json(
      {
        error: `${type.name} is used by ${used.n.toLocaleString()} sales order(s) — change their type first`,
      },
      { status: 409 }
    );
  }

  await db.delete(salesOrderTypes).where(eq(salesOrderTypes.id, type.id));
  return NextResponse.json({ ok: true });
}
