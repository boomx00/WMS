import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStock, locations, items } from "@/db/schema";
import { eq, and, gt, inArray } from "drizzle-orm";
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
// Returns every pickable location (RACK + FLOOR) currently holding the SKU.
// RACK rows come first, sorted H.1.1 → A.x.x; FLOOR rows follow.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const sku = sanitize(req.nextUrl.searchParams.get("sku") ?? "");
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const rows = await db
    .select({
      locationCode: locations.code,
      locationType: locations.type,
      quantity: locationStock.quantity,
    })
    .from(locationStock)
    .innerJoin(locations, eq(locationStock.locationId, locations.id))
    .innerJoin(items, eq(locationStock.itemId, items.id))
    .where(
      and(
        eq(items.sku, sku),
        gt(locationStock.quantity, 0),
        inArray(locations.type, ["RACK", "FLOOR"])
      )
    );

  // Aggregate in case a location has more than one location_stock row
  // for the same item (same guard as the heatmap fix).
  const byCode = new Map<string, { locationCode: string; locationType: string; quantity: number }>();
  for (const r of rows) {
    const existing = byCode.get(r.locationCode);
    if (existing) existing.quantity += r.quantity;
    else byCode.set(r.locationCode, { ...r });
  }

  const all = Array.from(byCode.values());
  const racks = all
    .filter((r) => r.locationType === "RACK")
    .sort((a, b) => compareRackCodes(a.locationCode, b.locationCode));
  const floors = all
    .filter((r) => r.locationType !== "RACK")
    .sort((a, b) => a.locationCode.localeCompare(b.locationCode));

  return NextResponse.json({ sku, locations: [...racks, ...floors] });
}