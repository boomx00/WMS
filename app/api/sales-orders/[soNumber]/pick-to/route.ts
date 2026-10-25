import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locationStockEvents, salesOrders } from "@/db/schema";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getLocationById, resolvePurposeLocation } from "@/lib/locationRules";

// The staging location an SO's picks go to ("Pick to" on the PDA). Chosen
// once on the PDA; every later picking session for the SO goes straight
// back to it until it's changed with Edit.

// GET /api/sales-orders/:soNumber/pick-to
//   { code }  — the last chosen one, or (for SOs picked before this was
//               remembered) where its most recent pick went; null when
//               there's none yet or it's no longer a staging location.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ soNumber: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { soNumber } = await params;
  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  let locationId = salesOrder.pickToLocationId;
  if (!locationId) {
    const [lastPick] = await db
      .select({ destinationLocationId: locationStockEvents.destinationLocationId })
      .from(locationStockEvents)
      .where(
        and(
          eq(locationStockEvents.salesOrderId, salesOrder.id),
          inArray(locationStockEvents.type, ["PICKING", "DEFAULT_PICKING"]),
          isNotNull(locationStockEvents.destinationLocationId)
        )
      )
      .orderBy(desc(locationStockEvents.createdAt), desc(locationStockEvents.id))
      .limit(1);
    locationId = lastPick?.destinationLocationId ?? null;
  }

  const location = locationId ? await getLocationById(db, locationId) : null;
  return NextResponse.json({ code: location?.isStaging ? location.code : null });
}

// PUT /api/sales-orders/:soNumber/pick-to
// body: { stagingLocationCode } — must be a staging location.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ soNumber: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { soNumber } = await params;
  const [salesOrder] = await db.select().from(salesOrders).where(eq(salesOrders.soNumber, soNumber));
  if (!salesOrder) {
    return NextResponse.json({ error: "Unknown sales order number" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body?.stagingLocationCode === "string" ? body.stagingLocationCode : "";
  if (!code.trim()) {
    return NextResponse.json({ error: "stagingLocationCode is required" }, { status: 400 });
  }

  const staging = await resolvePurposeLocation(db, "staging", code);
  if ("error" in staging) {
    return NextResponse.json({ error: staging.error }, { status: staging.status });
  }

  await db
    .update(salesOrders)
    .set({ pickToLocationId: staging.location.id })
    .where(eq(salesOrders.id, salesOrder.id));

  return NextResponse.json({ code: staging.location.code });
}
