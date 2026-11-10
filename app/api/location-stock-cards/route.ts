import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockCards } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  cardNameTaken,
  cleanCardLocationTypes,
  cleanCardName,
  cleanCardTranslation,
  cleanCardUnitIds,
  getLocationStockCards,
  nextCardSortOrder,
} from "@/lib/locationStockCards";

export const dynamic = "force-dynamic";

// GET /api/location-stock-cards — the Location Stock summary cards, in
// display order: [{ id, name, nameId, nameZh, locationTypes, unitIds, sortOrder }]
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json(await getLocationStockCards(db));
}

// POST /api/location-stock-cards
// body: { name, nameId?, nameZh?, locationTypes: ["FLOOR", ...], unitIds?: [unit ids] }
// Added at the end. unitIds empty / left out = automatic (each product's
// primary unit).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const denied = await denyUnlessAllowed(session, "settings.edit", { webOnly: false });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const name = cleanCardName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "Card name is required" }, { status: 400 });
  }
  if (await cardNameTaken(db, name)) {
    return NextResponse.json({ error: `There is already a card named "${name}"` }, { status: 409 });
  }
  const types = await cleanCardLocationTypes(db, body?.locationTypes);
  if ("error" in types) return NextResponse.json({ error: types.error }, { status: 400 });
  const unitIds = await cleanCardUnitIds(db, body?.unitIds);
  if ("error" in unitIds) return NextResponse.json({ error: unitIds.error }, { status: 400 });

  const [created] = await db
    .insert(locationStockCards)
    .values({
      name,
      nameId: cleanCardTranslation(body?.nameId),
      nameZh: cleanCardTranslation(body?.nameZh),
      locationTypes: types,
      unitIds: unitIds.length ? unitIds : null,
      sortOrder: await nextCardSortOrder(db),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
