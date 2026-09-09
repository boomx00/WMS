import { db } from "@/lib/db";
import { locations, locationStock, items } from "@/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";

async function getWarehouseMapData() {
  // Aggregate per location instead of a raw row-per-item leftJoin. A rack
  // location can end up with more than one location_stock row over time
  // (e.g. a stale quantity=0 row left behind after a move), and Postgres
  // doesn't guarantee which one comes back first without an ORDER BY that
  // covers it. Left unaggregated, two rows for the same location both map
  // to the same grid cell (same x/y), so whichever one happens to land
  // last in the array visually wins — which flips between requests and
  // can show a location as empty even though it currently has stock.
  //
  // Fixing this two ways together:
  //   1. Only join location_stock rows with quantity != 0, so a stale
  //      zero row can never compete with the real one.
  //   2. GROUP BY location and SUM the quantity, so even a legitimate
  //      multi-item location collapses into a single cell instead of
  //      producing duplicate overlapping entries.
  const rows = await db
    .select({
      locationId: locations.id,
      code: locations.code,
      area: locations.area,
      x: locations.x,
      y: locations.y,
      totalQuantity: sql<number>`COALESCE(SUM(${locationStock.quantity}), 0)`.as("total_quantity"),
      palletCartonQty: sql<number | null>`MAX(${items.palletCartonQty})`.as("pallet_carton_qty"),
    })
    .from(locations)
    .leftJoin(
      locationStock,
      and(eq(locationStock.locationId, locations.id), ne(locationStock.quantity, 0))
    )
    .leftJoin(items, eq(locationStock.itemId, items.id))
    .where(eq(locations.type, "RACK"))
    .groupBy(locations.id, locations.code, locations.area, locations.x, locations.y)
    .orderBy(locations.area, locations.x, locations.y);

  // Estimated pallet count = cartons at this cell (from location_stock,
  // the live v2 source of truth) / cartons per pallet for whatever's
  // stored there.
  return rows.map((row) => {
    const qty = row.totalQuantity ?? 0;
    return {
      ...row,
      totalQuantity: qty,
      estimatedPalletCount:
        qty > 0 && row.palletCartonQty ? qty / row.palletCartonQty : 0,
    };
  });
}

function colorForCount(count: number, maxExpected = 5) {
  if (count === 0) return "bg-zinc-800 text-zinc-500";
  const intensity = Math.min(count / maxExpected, 1);
  if (intensity <= 0.25) return "bg-amber-950 text-amber-200";
  if (intensity <= 0.5) return "bg-amber-800 text-amber-100";
  if (intensity <= 0.75) return "bg-amber-600 text-zinc-950";
  return "bg-amber-400 text-zinc-950";
}

const AREA_ROWS = [
  ["A", "B"],
  ["C", "D"],
  ["E", "F"],
  ["G", "H"],
];

function AreaGrid({
  area,
  cells,
}: {
  area: string;
  cells: Awaited<ReturnType<typeof getWarehouseMapData>>;
}) {
  if (cells.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-4">
        <div className="text-xs font-mono text-zinc-500 uppercase mb-3">
          Area {area}
        </div>
        <p className="text-xs text-zinc-600">No rack locations seeded.</p>
      </div>
    );
  }

  const maxX = Math.max(...cells.map((c) => c.x ?? 0));
  const maxY = Math.max(...cells.map((c) => c.y ?? 0));

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <div className="text-xs font-mono text-zinc-500 uppercase mb-3">
        Area {area}
      </div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${maxX}, minmax(0, 2rem))` }}
      >
        {cells.map((cell) => {
          const displayCount =
            cell.estimatedPalletCount > 0
              ? cell.estimatedPalletCount % 1 === 0
                ? cell.estimatedPalletCount.toString()
                : cell.estimatedPalletCount.toFixed(1)
              : "";

          return (
            <div
              key={cell.locationId}
              title={`${cell.code}: ${displayCount || "0"} pallet(s) (${cell.totalQuantity} units)`}
              className={`aspect-square rounded-sm flex items-center justify-center text-[6px] font-mono leading-none ${colorForCount(
                cell.estimatedPalletCount
              )}`}
              style={{
                gridColumnStart: cell.x ?? 1,
                gridRowStart: maxY - (cell.y ?? 1) + 1,
              }}
            >
              {displayCount}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function WarehouseMap() {
  const rows = await getWarehouseMapData();

  const areaMap = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.area) continue;
    if (!areaMap.has(row.area)) areaMap.set(row.area, []);
    areaMap.get(row.area)!.push(row);
  }

  const hasAnyData = areaMap.size > 0;

  if (!hasAnyData) {
    return (
      <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-12 text-center">
        <p className="text-zinc-500 text-sm">
          No rack locations yet — run the seed script to populate them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-auto">
      {AREA_ROWS.map(([leftArea, rightArea]) => (
        <div key={leftArea} className="flex gap-6 items-start w-max">
          <AreaGrid area={leftArea} cells={areaMap.get(leftArea) ?? []} />
          <AreaGrid area={rightArea} cells={areaMap.get(rightArea) ?? []} />
        </div>
      ))}
    </div>
  );
}