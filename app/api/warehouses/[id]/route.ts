import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations, warehouses } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import { isUniqueViolation } from "@/lib/locationAdmin";
import { getLocationById, hasPurpose, PURPOSE_LABELS, type LocationPurpose } from "@/lib/locationRules";
import {
  cleanWarehouseName,
  getWarehouseById,
  getWarehouses,
  pickDefaultWarehouse,
  warehouseNameTaken,
} from "@/lib/warehouses";

async function findWarehouse(params: Promise<{ id: string }>) {
  const { id } = await params;
  const warehouseId = Number(id);
  if (!Number.isInteger(warehouseId) || warehouseId <= 0) return null;
  return getWarehouseById(db, warehouseId);
}

// Settings → Locations & Marking: the location each PDA picker starts on,
// per warehouse.
const DEFAULT_LOCATION_KEYS: { key: "defaultReceivingLocationId" | "defaultStagingLocationId"; purpose: LocationPurpose }[] = [
  { key: "defaultReceivingLocationId", purpose: "receiving" },
  { key: "defaultStagingLocationId", purpose: "staging" },
];

// PATCH /api/warehouses/:id
// body: any of
//   name                         — rename (Locations → Warehouses)
//   isActive                     — deactivate / reactivate (Locations → Warehouses).
//                                  The default warehouse (first active one) and the
//                                  last active one can't be deactivated.
//   defaultReceivingLocationId   — a receiving location of this warehouse, or null
//   defaultStagingLocationId     — a staging location of this warehouse, or null
//                                  (Settings → Locations & Marking)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const warehouse = await findWarehouse(params);
  if (!warehouse) {
    return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Partial<typeof warehouses.$inferInsert> = {};

  if (body?.name !== undefined) {
    const denied = await denyUnlessAllowed(session, "locations.edit");
    if (denied) return denied;
    const name = cleanWarehouseName(body.name);
    if (!name) {
      return NextResponse.json({ error: "Warehouse name is required" }, { status: 400 });
    }
    if (await warehouseNameTaken(db, name, warehouse.id)) {
      return NextResponse.json({ error: `A warehouse named "${name}" already exists` }, { status: 409 });
    }
    updates.name = name;
  }

  if (body?.isActive !== undefined) {
    const denied = await denyUnlessAllowed(session, "locations.edit");
    if (denied) return denied;
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be true or false" }, { status: 400 });
    }
    if (!body.isActive && warehouse.isActive) {
      const all = await getWarehouses(db);
      const active = all.filter((w) => w.isActive);
      if (active.length <= 1) {
        return NextResponse.json({ error: "There has to be at least one active warehouse" }, { status: 409 });
      }
      // Older scanners (and anything that doesn't say which warehouse) use
      // the default one, so it can't just disappear from under them.
      if (pickDefaultWarehouse(all)?.id === warehouse.id) {
        return NextResponse.json(
          {
            error: `${warehouse.name} is the default warehouse (the first active one). Move another active warehouse above it first.`,
          },
          { status: 409 }
        );
      }
    }
    updates.isActive = body.isActive;
  }

  const changesDefaults = DEFAULT_LOCATION_KEYS.some(({ key }) => body?.[key] !== undefined);
  if (changesDefaults) {
    const denied = await denyUnlessAllowed(session, "settings.edit", { webOnly: false });
    if (denied) return denied;
  }
  for (const { key, purpose } of DEFAULT_LOCATION_KEYS) {
    if (body?.[key] === undefined) continue;
    if (body[key] === null) {
      updates[key] = null;
      continue;
    }
    const id = Number(body[key]);
    const location = Number.isInteger(id) && id > 0 ? await getLocationById(db, id) : null;
    if (!location) {
      return NextResponse.json({ error: "That location no longer exists — refresh and try again" }, { status: 400 });
    }
    if (location.warehouseId !== warehouse.id) {
      return NextResponse.json({ error: `${location.code} isn't in ${warehouse.name}` }, { status: 400 });
    }
    if (!hasPurpose(location, purpose)) {
      return NextResponse.json(
        { error: `${location.code} isn't a ${PURPOSE_LABELS[purpose].toLowerCase()} location — set it in "Used for" on the Locations page first` },
        { status: 400 }
      );
    }
    updates[key] = id;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  try {
    const [updated] = await db.update(warehouses).set(updates).where(eq(warehouses.id, warehouse.id)).returning();
    return NextResponse.json(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: `A warehouse named "${updates.name}" already exists` }, { status: 409 });
    }
    throw err;
  }
}

// DELETE /api/warehouses/:id
// Only an empty warehouse (no locations) can be deleted, and never the
// last one. Its Total Stock columns go with it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "locations.edit");
  if (denied) return denied;

  const warehouse = await findWarehouse(params);
  if (!warehouse) {
    return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
  }

  const all = await getWarehouses(db);
  if (all.length <= 1) {
    return NextResponse.json({ error: "There has to be at least one warehouse" }, { status: 409 });
  }

  const [used] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(locations)
    .where(eq(locations.warehouseId, warehouse.id));
  if ((used?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: `${warehouse.name} still has ${used.count} location(s). Move or delete them first.` },
      { status: 409 }
    );
  }

  try {
    await db.delete(warehouses).where(eq(warehouses.id, warehouse.id));
  } catch (err) {
    // A location was added to it at the same moment (FK restrict).
    const e = err as { code?: string; cause?: { code?: string } };
    if (e?.code === "23503" || e?.cause?.code === "23503") {
      return NextResponse.json({ error: `${warehouse.name} still has locations — refresh and try again` }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ deleted: warehouse.id });
}
