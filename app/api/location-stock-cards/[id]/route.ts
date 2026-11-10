import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockCards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  cardNameTaken,
  cleanCardLocationTypes,
  cleanCardName,
  cleanCardTranslation,
  cleanCardUnitIds,
  getLocationStockCard,
} from "@/lib/locationStockCards";

async function authorize() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return denyUnlessAllowed(session, "settings.edit", { webOnly: false });
}

async function findCard(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return getLocationStockCard(db, id);
}

// PATCH /api/location-stock-cards/:id
// body: any of { name, nameId, nameZh, locationTypes, unitIds } — fields
// left out stay as they are; an empty translation or empty unitIds clears it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize();
  if (denied) return denied;

  const card = await findCard(params);
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof locationStockCards.$inferInsert> = {};

  if (body && "name" in body) {
    const name = cleanCardName(body.name);
    if (!name) return NextResponse.json({ error: "Card name is required" }, { status: 400 });
    if (await cardNameTaken(db, name, card.id)) {
      return NextResponse.json({ error: `There is already a card named "${name}"` }, { status: 409 });
    }
    updates.name = name;
  }
  if (body && "nameId" in body) updates.nameId = cleanCardTranslation(body.nameId);
  if (body && "nameZh" in body) updates.nameZh = cleanCardTranslation(body.nameZh);
  if (body && "locationTypes" in body) {
    const types = await cleanCardLocationTypes(db, body.locationTypes);
    if ("error" in types) return NextResponse.json({ error: types.error }, { status: 400 });
    updates.locationTypes = types;
  }
  if (body && "unitIds" in body) {
    const unitIds = await cleanCardUnitIds(db, body.unitIds);
    if ("error" in unitIds) return NextResponse.json({ error: unitIds.error }, { status: 400 });
    updates.unitIds = unitIds.length ? unitIds : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  const [updated] = await db
    .update(locationStockCards)
    .set(updates)
    .where(eq(locationStockCards.id, card.id))
    .returning();
  return NextResponse.json(updated);
}

// DELETE /api/location-stock-cards/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize();
  if (denied) return denied;

  const card = await findCard(params);
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  await db.delete(locationStockCards).where(eq(locationStockCards.id, card.id));
  return NextResponse.json({ deleted: card.id });
}
