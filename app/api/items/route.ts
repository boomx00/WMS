import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

async function requireAdmin(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, userId));
  return row?.roleName?.toLowerCase() === "admin";
}

export async function GET() {
  const rows = await db.select().from(items).orderBy(items.sku);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const isAdmin = await requireAdmin(session.userId);
  if (!isAdmin) {
    return NextResponse.json({ error: "Only admins can create items" }, { status: 403 });
  }

  const body = await req.json();
  const { sku, name, cartonBagQty, palletCartonQty, legacySku, cartonBarcode } = body;

  if (!sku || !name || cartonBagQty === undefined || palletCartonQty === undefined) {
    return NextResponse.json(
      { error: "sku, name, cartonBagQty, and palletCartonQty are required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(items)
    .values({
      sku,
      name,
      cartonBagQty,
      palletCartonQty,
      defaultCode: `${sku}*default`,
      legacySku: legacySku && legacySku.trim() ? legacySku.trim() : null,
      cartonBarcode: cartonBarcode && cartonBarcode.trim() ? cartonBarcode.trim() : null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}