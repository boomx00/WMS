import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pallets, items } from "@/db/schema";
import { eq, or, ilike } from "drizzle-orm";
import { getWorkOrderSummary } from "@/lib/workOrders";

const MAX_RESULTS = 100;

// GET /api/work-orders/search?q=...
// Searches every work order in the database (not just the currently
// loaded/paginated page) by work order number, SKU, or product name.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;

  const matches = await db
    .selectDistinct({ workOrderNumber: pallets.workOrderNumber })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .where(or(ilike(pallets.workOrderNumber, pattern), ilike(items.sku, pattern), ilike(items.name, pattern)))
    .orderBy(pallets.workOrderNumber)
    .limit(MAX_RESULTS);

  const workOrderNumbers = matches.map((m) => m.workOrderNumber).sort().reverse();

  const summary = await getWorkOrderSummary(workOrderNumbers);

  return NextResponse.json(summary);
}