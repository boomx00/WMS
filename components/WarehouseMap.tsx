import { db } from "@/lib/db";
import { locations, pallets } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

async function getWarehouseMapData() {
  const rows = await db
    .select({
      locationId: locations.id,
      code: locations.code,
      area: locations.area,
      x: locations.x,
      y: locations.y,
      palletCount: sql<number>`count(${pallets.id})::int`,
    })
    .from(locations)
    .leftJoin(
      pallets,
      and(eq(pallets.locationId, locations.id), eq(pallets.status, "ACTIVE"))
    )
    .where(eq(locations.type, "RACK"))
    .groupBy(locations.id)
    .orderBy(locations.area, locations.x, locations.y);

  return rows;
}

function colorForCount(count: number, maxExpected = 5) {
  if (count === 0) return "bg-zinc-800 text-zinc-500";
  const intensity = Math.min(count / maxExpected, 1);
  if (intensity <= 0.25) return "bg-amber-950 text-amber-200";
  if (intensity <= 0.5) return "bg-amber-800 text-amber-100";
  if (intensity <= 0.75) return "bg-amber-600 text-zinc-950";
  return "bg-amber-400 text-zinc-950";
}

// Physical layout: paired rows, left area then right area
const AREA_ROWS = [
  ["A", "B"],
  ["C", "D"],
  ["E", "F"],
  ["G", "H"],
];

function AreaGrid({ area, cells }: { area: string; cells: Awaited<ReturnType<typeof getWarehouseMapData>> }) {
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
  {cells.map((cell) => (
    <div
      key={cell.locationId}
      title={`${cell.code}: ${cell.palletCount} pallet(s)`}
      className={`aspect-square rounded-sm flex items-center justify-center text-[6px] font-mono leading-none ${colorForCount(
        cell.palletCount
      )}`}
      style={{
        gridColumnStart: cell.x ?? 1,
        gridRowStart: maxY - (cell.y ?? 1) + 1,
      }}
    >
      {cell.code}
    </div>
  ))}
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