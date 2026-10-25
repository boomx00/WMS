import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationTypes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  checkTypeNameFree,
  checkTypeRuleChange,
  isAdminError,
  parseLocationTypeInput,
} from "@/lib/locationAdmin";

// PATCH /api/location-types/:id
// body: { name, allowsMultipleSku, hasPosition, pickable, maxPallets }
// The whole type is sent each time. Its code never changes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locations.edit");
  if (denied) return denied;

  const { id } = await params;
  const typeId = Number(id);
  if (!Number.isInteger(typeId) || typeId <= 0) {
    return NextResponse.json({ error: "Invalid type id" }, { status: 400 });
  }

  const [existing] = await db.select().from(locationTypes).where(eq(locationTypes.id, typeId));
  if (!existing) {
    return NextResponse.json({ error: "Location type not found" }, { status: 404 });
  }

  const input = parseLocationTypeInput(await req.json());
  if (isAdminError(input)) {
    return NextResponse.json({ error: input.error }, { status: input.status });
  }

  const problem = (await checkTypeNameFree(db, input.name, typeId)) ?? (await checkTypeRuleChange(db, existing, input));
  if (problem) {
    return NextResponse.json({ error: problem.error }, { status: problem.status });
  }

  const [updated] = await db
    .update(locationTypes)
    .set(input)
    .where(eq(locationTypes.id, typeId))
    .returning();

  return NextResponse.json(updated);
}
