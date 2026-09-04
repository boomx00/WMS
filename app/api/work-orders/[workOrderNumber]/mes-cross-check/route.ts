import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMesTagTransitRecords } from "@/lib/mes";

// GET /api/work-orders/{workOrderNumber}/mes-cross-check
// Read-only: fetches MES's Tag Transit Records for this MO/work order number
// so the client can line them up against the WMS pallets already loaded for
// this work order. Nothing is written on either side.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workOrderNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { workOrderNumber } = await params;
  if (!workOrderNumber) {
    return NextResponse.json({ error: "Work order number is required" }, { status: 400 });
  }

  try {
    const records = await getMesTagTransitRecords(workOrderNumber);
    return NextResponse.json({ records });
  } catch (err) {
    console.error("MES cross-check failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach MES" },
      { status: 502 }
    );
  }
}