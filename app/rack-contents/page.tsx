import { db } from "@/lib/db";
import { locations, pallets, items } from "@/db/schema";
import { eq } from "drizzle-orm";
import RackContentsTable from "./RackContentsTable";

export const dynamic = "force-dynamic";

// Special locations always appear first, in this order, ahead of racks
const SPECIAL_ORDER = ["FLOOR", "DESTROY", "LEFTOVER"];

async function getRackContents() {
  const allLocations = await db.select().from(locations);

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
    area: loc.area,
    x: loc.x,
    y: loc.y,
    pallets: palletsByLocation.get(loc.id) ?? [],
  }));

  // Sort: special locations first (in SPECIAL_ORDER), then racks by area/x/y
  rows.sort((a, b) => {
    const aSpecialIdx = SPECIAL_ORDER.indexOf(a.type);
    const bSpecialIdx = SPECIAL_ORDER.indexOf(b.type);

    if (aSpecialIdx !== -1 || bSpecialIdx !== -1) {
      if (aSpecialIdx === -1) return 1;
      if (bSpecialIdx === -1) return -1;
      return aSpecialIdx - bSpecialIdx;
    }

    // Both are racks — sort by area, then x, then y
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