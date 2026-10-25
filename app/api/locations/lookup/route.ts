import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, pallets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/locations/lookup?code=A.1.1
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.code, code));

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const activePallets = await db
    .select()
    .from(pallets)
    .where(and(eq(pallets.locationId, location.id), eq(pallets.status, "ACTIVE")));

  return NextResponse.json({ location, pallets: activePallets });
}