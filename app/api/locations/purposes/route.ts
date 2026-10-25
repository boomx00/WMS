import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  getDefaultLocation,
  getPurposeLocations,
  type LocationPurpose,
  type LocationWithRules,
} from "@/lib/locationRules";
import { isMarkingEnabled } from "@/lib/stagingMarks";
import { resolveWarehouse } from "@/lib/warehouses";

// GET /api/locations/purposes[?warehouseId=N]
// One warehouse's receiving and staging locations, and which one each PDA
// picker starts on (that warehouse's defaults on Settings → Locations &
// Marking). Without warehouseId, the default warehouse (first active one;
// older APKs). An inactive or deleted warehouse is a 404.
// Inbound / Move Floor → Rack choose from `receiving`; Picking / Shipping /
// Outbound contents from `staging`.
//   {
//     warehouse: { id, name },
//     receiving: { locations: [{ code, name, type }], defaultCode },
//     staging:   { locations: [{ code, name, type }], defaultCode },
//     markingEnabled   (order marking on/off, Settings → Locations & Marking)
//   }
// defaultCode is null when there's no default (nothing set and more than
// one location to choose from, or none at all).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // An inactive warehouse is 404 like a deleted one: the PDA then falls
  // back to the default warehouse.
  const resolved = await resolveWarehouse(db, req.nextUrl.searchParams.get("warehouseId"), { activeOnly: true });
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { warehouse } = resolved;

  const describe = (location: LocationWithRules) => ({
    code: location.code,
    name: location.rules.name,
    type: location.type,
  });

  const options = async (purpose: LocationPurpose) => {
    const [all, fallback] = await Promise.all([
      getPurposeLocations(db, purpose, warehouse.id),
      getDefaultLocation(db, purpose, warehouse.id),
    ]);
    return { locations: all.map(describe), defaultCode: fallback?.code ?? null };
  };

  const [receiving, staging, markingEnabled] = await Promise.all([
    options("receiving"),
    options("staging"),
    isMarkingEnabled(db),
  ]);
  return NextResponse.json({
    warehouse: { id: warehouse.id, name: warehouse.name },
    receiving,
    staging,
    markingEnabled,
  });
}
