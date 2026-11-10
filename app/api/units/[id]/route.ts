import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { units } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { getSession, isSuperUser } from "@/lib/auth";
import { countCategoriesUsingUnit } from "@/lib/units";
import { cleanName, cleanUnitCode, MAX_UNIT_DECIMALS } from "@/lib/uom";

async function managerOnly() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!(await isSuperUser(session.userId))) {
    return NextResponse.json({ error: "Only Manager can edit units" }, { status: 403 });
  }
  return null;
}

// PATCH /api/units/:id — Manager only.
// body: { code?, name?, nameId?, nameZh?, decimals?, sortOrder? }
// Decimals can't change while a category uses the unit: once stock is kept
// in base units, that would change what every stored quantity means.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await managerOnly();
  if (denied) return denied;

  const id = Number((await params).id);
  const [unit] = await db.select().from(units).where(eq(units.id, id));
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof units.$inferInsert> = {};

  if (body.code !== undefined) {
    const code = cleanUnitCode(body.code);
    if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });
    const [clash] = await db
      .select({ id: units.id })
      .from(units)
      .where(and(sql`lower(${units.code}) = lower(${code})`, ne(units.id, id)));
    if (clash) return NextResponse.json({ error: `There is already a unit with code "${code}"` }, { status: 409 });
    updates.code = code;
  }
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    updates.name = name;
  }
  if (body.nameId !== undefined) updates.nameId = cleanName(body.nameId);
  if (body.nameZh !== undefined) updates.nameZh = cleanName(body.nameZh);
  if (body.decimals !== undefined) {
    const decimals = Number(body.decimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_UNIT_DECIMALS) {
      return NextResponse.json({ error: `Decimals must be a whole number from 0 to ${MAX_UNIT_DECIMALS}` }, { status: 400 });
    }
    if (decimals !== unit.decimals && (await countCategoriesUsingUnit(db, id)) > 0) {
      return NextResponse.json(
        { error: `${unit.name} is used by a category, so its decimals can't change` },
        { status: 409 }
      );
    }
    updates.decimals = decimals;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) return NextResponse.json({ error: "Invalid sort order" }, { status: 400 });
    updates.sortOrder = sortOrder;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  const [updated] = await db.update(units).set(updates).where(eq(units.id, id)).returning();
  return NextResponse.json(updated);
}

// DELETE /api/units/:id — Manager only. Not allowed while a category uses it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await managerOnly();
  if (denied) return denied;

  const id = Number((await params).id);
  const [unit] = await db.select().from(units).where(eq(units.id, id));
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  const used = await countCategoriesUsingUnit(db, id);
  if (used > 0) {
    return NextResponse.json(
      { error: `${unit.name} is used by ${used} categor${used === 1 ? "y" : "ies"}, so it can't be deleted` },
      { status: 409 }
    );
  }
  await db.delete(units).where(eq(units.id, id));
  return NextResponse.json({ ok: true });
}
