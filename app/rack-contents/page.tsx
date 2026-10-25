import { db } from "@/lib/db";
import { locations, locationTypes, pallets, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import RackContentsTable from "./RackContentsTable";

export const dynamic = "force-dynamic";

async function getRackContents() {
  const allLocations = await db
    .select({
      id: locations.id,
      code: locations.code,
      type: locations.type,
      area: locations.area,
      x: locations.x,
      y: locations.y,
      typeName: locationTypes.name,
      typeOrder: locationTypes.sortOrder,
      hasPosition: locationTypes.hasPosition,
    })
    .from(locations)
    .innerJoin(locationTypes, eq(locations.type, locationTypes.code));

  const activePallets = await db
    .select({
      locationId: pallets.locationId,
      palletId: pallets.id,
      label: pallets.label,
      quantity: pallets.quantity,
      workOrderNumber: pallets.workOrderNumber,
      itemSku: items.sku,
      itemName: items.name,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .where(eq(pallets.status, "ACTIVE"));

  const palletsByLocation = new Map<number, typeof activePallets>();
  for (const p of activePallets) {
    if (!palletsByLocation.has(p.locationId)) {
      palletsByLocation.set(p.locationId, []);
    }
    palletsByLocation.get(p.locationId)!.push(p);
  }

  const rows = allLocations.map((loc) => ({
    locationId: loc.id,
    code: loc.code,
    type: loc.type,
    typeName: loc.typeName,
    typeOrder: loc.typeOrder,
    hasPosition: loc.hasPosition,
    area: loc.area,
    x: loc.x,
    y: loc.y,
    pallets: palletsByLocation.get(loc.id) ?? [],
  }));

  // Sort: locations without a rack position first (by type order from the
  // Locations page, then code), then positioned ones by area/x/y
  rows.sort((a, b) => {
    if (a.hasPosition !== b.hasPosition) return a.hasPosition ? 1 : -1;

    if (!a.hasPosition) {
      return a.typeOrder - b.typeOrder || a.code.localeCompare(b.code, undefined, { numeric: true });
    }

    // Both positioned — sort by area, then x, then y
    if (a.area !== b.area) return (a.area ?? "").localeCompare(b.area ?? "");
    if (a.x !== b.x) return (a.x ?? 0) - (b.x ?? 0);
    return (a.y ?? 0) - (b.y ?? 0);
  });

  return rows;
}

export default async function RackContentsPage() {
  const rows = await getRackContents();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Location Contents</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Search any location — Floor, Destroy, Leftover, or a rack cell — to
          see what's stored there.
        </p>
      </header>

      <RackContentsTable rows={rows} />
    </div>
  );
}