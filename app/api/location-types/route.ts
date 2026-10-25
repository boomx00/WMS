import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationTypes } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  checkTypeNameFree,
  generateTypeCode,
  isAdminError,
  isUniqueViolation,
  listLocationTypesWithCounts,
  nextTypeSortOrder,
  parseLocationTypeInput,
} from "@/lib/locationAdmin";

// GET /api/location-types — every type, in display order, with how many
// locations use it.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  return NextResponse.json(await listLocationTypesWithCounts(db));
}

// POST /api/location-types
// body: { name, allowsMultipleSku, hasPosition, pickable, maxPallets }
// The code is generated from the name ("Cold Room" -> COLD_ROOM) and never
// changes afterwards; the name can be edited freely.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locations.edit");
  if (denied) return denied;

  const input = parseLocationTypeInput(await req.json());
  if (isAdminError(input)) {
    return NextResponse.json({ error: input.error }, { status: input.status });
  }

  const nameTaken = await checkTypeNameFree(db, input.name);
  if (nameTaken) {
    return NextResponse.json({ error: nameTaken.error }, { status: nameTaken.status });
  }

  try {
    const [created] = await db
      .insert(locationTypes)
      .values({
        ...input,
        code: await generateTypeCode(db, input.name),
        sortOrder: await nextTypeSortOrder(db),
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That type was just created by someone else — refresh and try again" }, { status: 409 });
    }
    throw err;
  }
}
