import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getDefaultLocation, type LocationWithRules } from "@/lib/locationRules";

// GET /api/locations/roles
// Kept for the APK built before location pickers (it asks this once for
// where to send stock): returns the default receiving / staging locations
// from Settings → Locations & Marking. Newer APKs use /api/locations/purposes.
//   { receiving: { code, name, type } | null, outbound: { code, name, type } | null }
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const describe = (location: LocationWithRules | null) =>
    location ? { code: location.code, name: location.rules.name, type: location.type } : null;

  const [receiving, outbound] = await Promise.all([
    getDefaultLocation(db, "receiving").then(describe),
    getDefaultLocation(db, "staging").then(describe),
  ]);

  return NextResponse.json({ receiving, outbound });
}
