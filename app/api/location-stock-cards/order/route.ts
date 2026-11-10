import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockCards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { getLocationStockCards } from "@/lib/locationStockCards";

// PUT /api/location-stock-cards/order
// body: { ids: [3, 1, 2, ...] } — every card id, in the new display order.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const denied = await denyUnlessAllowed(session, "settings.edit", { webOnly: false });
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  const current = await getLocationStockCards(db);
  const sameSet =
    Array.isArray(ids) &&
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    current.every((c) => ids.includes(c.id));
  if (!sameSet) {
    return NextResponse.json({ error: "The card list changed — refresh and try again" }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of (ids as number[]).entries()) {
      await tx.update(locationStockCards).set({ sortOrder: (index + 1) * 10 }).where(eq(locationStockCards.id, id));
    }
  });
  return NextResponse.json(await getLocationStockCards(db));
}
