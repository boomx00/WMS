import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  isAdminError,
  isUniqueViolation,
  parseLocationInput,
  saveLocation,
  validateLocation,
} from "@/lib/locationAdmin";

// GET /api/locations - list all locations
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const rows = await db.select().from(locations);
  return NextResponse.json(rows);
}

// POST /api/locations - create a location
// body: { code, type, area?, x?, y?, isReceiving, isStaging, countsInTotalStock, stockColumnId }
// stockColumnId: a Total Stock column id, or null for "Total only".
// area/x/y are required when the type has a rack position, ignored otherwise.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locations.edit");
  if (denied) return denied;

  const input = parseLocationInput(await req.json());
  if (isAdminError(input)) {
    return NextResponse.json({ error: input.error }, { status: input.status });
  }

  const checked = await validateLocation(db, input, null);
  if (isAdminError(checked)) {
    return NextResponse.json({ error: checked.error }, { status: checked.status });
  }

  try {
    const created = await saveLocation(db, checked.values, null);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "That code or position was just taken by another location — refresh and try again" },
        { status: 409 }
      );
    }
    throw err;
  }
}
