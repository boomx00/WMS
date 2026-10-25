import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, locations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { normalizeLabel } from "@/lib/labelNormalize";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/pallets/lookup-at-location?label=...&locationCode=OUTBOUND_WH
export async function GET(req: NextRequest) {
  const rawLabel = sanitize(req.nextUrl.searchParams.get("label") ?? "");
  const locationCode = sanitize(req.nextUrl.searchParams.get("locationCode") ?? "");

  if (!rawLabel || !locationCode) {
    return NextResponse.json({ error: "label and locationCode are required" }, { status: 400 });
  }

  const label = await normalizeLabel(db, rawLabel);

  const [location] = await db.select().from(locations).where(eq(locations.code, locationCode));
  if (!location) {
    return NextResponse.json({ error: "Unknown location code" }, { status: 404 });
  }

  const [pallet] = await db
    .select()
    .from(pallets)
    .where(
      and(
        eq(pallets.label, label),
        eq(pallets.locationId, location.id),
        eq(pallets.status, "ACTIVE")
      )
    );

  if (!pallet) {
    return NextResponse.json({ error: "Barang tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({ label: pallet.label, quantity: pallet.quantity });
}