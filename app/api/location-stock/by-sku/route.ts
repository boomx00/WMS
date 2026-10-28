import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, locationTypes, items } from "@/db/schema";
import { eq, and, gt, ne } from "drizzle-orm";
import { getSession } from "@/lib/auth";

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// Splits "H.1.10" into ["H", 1, 10] so numeric parts sort numerically
// (1, 2, 10) instead of as text (1, 10, 2).
function parseCode(code: string): { area: string; nums: number[] } {
  const [area, ...rest] = code.split(".");
  return { area: area ?? "", nums: rest.map((n) => parseInt(n, 10) || 0) };
}

// RACK cells: area descending (H → A), then each numeric part ascending,
// so the list starts at H.1.1 and ends at A.x.x.
function compareRackCodes(a: string, b: string): number {
  const pa = parseCode(a);
  const pb = parseCode(b);
  if (pa.area !== pb.area) return pb.area.localeCompare(pa.area);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// GET /api/location-stock/by-sku?sku=XXXX
// Returns every pickable location currently holding the SKU — locations
// whose type is ticked "Can be picked from" (today: RACK + FLOOR).
// Locations with a rack position come first, sorted H.1.1 → A.x.x; the
// rest (floor and other mixed areas) follow.
//
// GET /api/location-stock/by-sku?sku=XXXX&all=1
// Every location holding the SKU, pickable or not (DEFECT, EXPOR, Outbound
// WH...), with any non-zero quantity — the same rows the per-SKU stock
// opname sums when it locks a SKU's system qty, so the list adds up to it.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const sku = sanitize(req.nextUrl.searchParams.get("sku") ?? "");
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const allParam = req.nextUrl.searchParams.get("all");
  const includeAll = allParam === "1" || allParam === "true";

  const where = includeAll
    ? and(eq(items.sku, sku), ne(locationStock.quantity, 0))
    : and(
        eq(items.sku, sku),
        gt(locationStock.quantity, 0),
        eq(locationTypes.pickable, true)
      );

  const rows = await db
    .select({
      locationCode: locations.code,
      locationType: locations.type,
      quantity: locationStock.quantity,
      hasPosition: locationTypes.hasPosition,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    // Left join so a location whose type row is missing still shows in
    // all=1 mode (the opname lock doesn't need it either); in pickable mode
    // the pickable = true filter excludes those rows as before.
    .leftJoin(locationTypes, eq(locations.type, locationTypes.code))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(where);

  // Aggregate in case a location has more than one location_stock row
  // for the same item (same guard as the heatmap fix).
  const byCode = new Map<string, { locationCode: string; locationType: string; quantity: number; hasPosition: boolean }>();
  for (const r of rows) {
    const existing = byCode.get(r.locationCode);
    if (existing) existing.quantity += r.quantity;
    else byCode.set(r.locationCode, { ...r, hasPosition: r.hasPosition ?? false });
  }

  // Rows that net to zero after aggregation aren't really "there".
  const all = Array.from(byCode.values()).filter((r) => r.quantity !== 0);
  const racks = all
    .filter((r) => r.hasPosition)
    .sort((a, b) => compareRackCodes(a.locationCode, b.locationCode));
  const floors = all
    .filter((r) => !r.hasPosition)
    .sort((a, b) => a.locationCode.localeCompare(b.locationCode));

  const strip = ({ hasPosition, ...row }: (typeof all)[number]) => row;
  return NextResponse.json({ sku, locations: [...racks, ...floors].map(strip) });
}
