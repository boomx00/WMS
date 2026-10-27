import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, stockColumns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { cleanColumnName, cleanColumnTranslation, columnNameTaken, locationsUsingColumn } from "@/lib/stockColumns";

async function authorize() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) };
  }
  const denied = await denyUnlessAllowed(session, "settings.edit", { webOnly: false });
  if (denied) return { error: denied };
  return { error: null };
}

async function findColumn(params: Promise<{ id: string }>) {
  const { id } = await params;
  const columnId = Number(id);
  if (!Number.isInteger(columnId) || columnId <= 0) return null;
  const [column] = await db.select().from(stockColumns).where(eq(stockColumns.id, columnId));
  return column ?? null;
}

// PATCH /api/stock-columns/:id
// body: { name, nameId?, nameZh? } — renames the column (and its Indonesian /
// Chinese names; a translation left out stays as it is, an empty one is
// cleared). Locations under it stay under it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await authorize();
  if (error) return error;

  const column = await findColumn(params);
  if (!column) {
    return NextResponse.json({ error: "Column not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = cleanColumnName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "Column name is required" }, { status: 400 });
  }
  if (await columnNameTaken(db, column.warehouseId, name, column.id)) {
    return NextResponse.json({ error: `This warehouse already has a column named "${name}"` }, { status: 409 });
  }

  const [updated] = await db
    .update(stockColumns)
    .set({
      name,
      ...(body && "nameId" in body ? { nameId: cleanColumnTranslation(body.nameId) } : {}),
      ...(body && "nameZh" in body ? { nameZh: cleanColumnTranslation(body.nameZh) } : {}),
    })
    .where(eq(stockColumns.id, column.id))
    .returning();

  return NextResponse.json(updated);
}

// DELETE /api/stock-columns/:id[?force=true]
// Locations shown under the column are refused unless force=true; then
// they're set to "Total only" (still counted in the total, under no
// column) and the column is deleted, in one transaction.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await authorize();
  if (error) return error;

  const column = await findColumn(params);
  if (!column) {
    return NextResponse.json({ error: "Column not found" }, { status: 404 });
  }

  const force = req.nextUrl.searchParams.get("force") === "true";
  const inUse = await locationsUsingColumn(db, column.id);
  if (inUse.length > 0 && !force) {
    const listed = inUse.length <= 5 ? inUse.join(", ") : `${inUse.slice(0, 5).join(", ")} and ${inUse.length - 5} more`;
    return NextResponse.json(
      { error: `"${column.name}" is still used by ${listed}. Move those locations to another column first.` },
      { status: 409 }
    );
  }

  await db.transaction(async (tx) => {
    await tx.update(locations).set({ stockColumnId: null }).where(eq(locations.stockColumnId, column.id));
    await tx.delete(stockColumns).where(eq(stockColumns.id, column.id));
  });
  return NextResponse.json({ deleted: column.id, locationsSetToTotalOnly: inUse.length });
}
