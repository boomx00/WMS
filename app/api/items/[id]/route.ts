import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";

// PATCH /api/items/:id - update an item's legacy code
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = Number(id);

  const body = await req.json();
  const { legacySku } = body;

  const [updated] = await db
    .update(items)
    .set({ legacySku: legacySku && legacySku.trim() ? legacySku.trim() : null })
    .where(eq(items.id, itemId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}