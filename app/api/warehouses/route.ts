import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { warehouses } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { isUniqueViolation } from "@/lib/locationAdmin";
import {
  cleanWarehouseName,
  listWarehousesWithCounts,
  nextWarehouseSortOrder,
  warehouseNameTaken,
} from "@/lib/warehouses";

// GET /api/warehouses — every warehouse (parent location) in display order,
// active and inactive, with how many locations it has. The first active one
// is the default warehouse. Used by the Locations page and by the PDA after
// login (it asks which warehouse to work in when there's more than one
// active one; inactive ones aren't offered).
//   [{ id, name, sortOrder, isActive, defaultReceivingLocationId, defaultStagingLocationId, locationCount }]
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json(await listWarehousesWithCounts(db));
}

// POST /api/warehouses
// body: { name, isActive? } — added at the end of the list, with no
// locations, no Total Stock columns and no default locations yet.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locations.edit");
  if (denied) return denied;

  const body = await req.json();
  const name = cleanWarehouseName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "Warehouse name is required" }, { status: 400 });
  }
  if (body?.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be true or false" }, { status: 400 });
  }
  if (await warehouseNameTaken(db, name)) {
    return NextResponse.json({ error: `A warehouse named "${name}" already exists` }, { status: 409 });
  }

  try {
    const [created] = await db
      .insert(warehouses)
      .values({ name, isActive: body?.isActive ?? true, sortOrder: await nextWarehouseSortOrder(db) })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: `A warehouse named "${name}" already exists` }, { status: 409 });
    }
    throw err;
  }
}
