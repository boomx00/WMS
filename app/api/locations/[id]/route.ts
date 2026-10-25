import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  isAdminError,
  isUniqueViolation,
  parseLocationInput,
  saveLocation,
  validateLocation,
} from "@/lib/locationAdmin";

// PATCH /api/locations/:id
// body: same as POST /api/locations — the whole location is sent each time.
// Stock, pallets and history are linked by id, so renaming a location keeps
// them; only printed labels with the old code stop scanning.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locations.edit");
  if (denied) return denied;

  const { id } = await params;
  const locationId = Number(id);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return NextResponse.json({ error: "Invalid location id" }, { status: 400 });
  }

  const [existing] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const input = parseLocationInput(await req.json());
  if (isAdminError(input)) {
    return NextResponse.json({ error: input.error }, { status: input.status });
  }

  const checked = await validateLocation(db, input, existing);
  if (isAdminError(checked)) {
    return NextResponse.json({ error: checked.error }, { status: checked.status });
  }

  try {
    const updated = await saveLocation(db, checked.values, locationId);
    return NextResponse.json(updated);
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
