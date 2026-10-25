import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders, tambahanOrders } from "@/db/schema";
import { inArray, ilike, or } from "drizzle-orm";
import { getSoProgress } from "@/lib/soProgress";

// GET /api/sales-orders/search-any?q=...
//
// Unlike /api/sales-orders/open-list, this does NOT filter out DONE
// orders — it's for the PDA search bar, so a driver can still find and
// open a fully-shipped SO to work on its Tambahan.
//
// Also matches against a Tambahan's convertedSoNumber: since conversion
// is a label-only action (no real sales_orders row gets created for the
// new number), searching that number wouldn't find anything otherwise —
// but the driver still needs to reach the PARENT SO to continue shipping
// the Tambahan's remaining stock, since that's where the actual
// picking/shipping screens and the Tambahan section live.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json([]);
  }

  const directMatches = await db
    .select()
    .from(salesOrders)
    .where(ilike(salesOrders.soNumber, `%${q}%`))
    .limit(50);

  const tambahanMatches = await db
    .select({
      parentSalesOrderId: tambahanOrders.parentSalesOrderId,
      convertedSoNumber: tambahanOrders.convertedSoNumber,
      tambahanNumber: tambahanOrders.tambahanNumber,
    })
    .from(tambahanOrders)
    .where(
      or(
        ilike(tambahanOrders.convertedSoNumber, `%${q}%`),
        ilike(tambahanOrders.tambahanNumber, `%${q}%`)
      )
    )
    .limit(50);

  const directIds = new Set(directMatches.map((o) => o.id));
  const extraParentIds = tambahanMatches
    .map((t) => t.parentSalesOrderId)
    .filter((id) => !directIds.has(id));

  const matchNoteByParentId = new Map<number, string>();
  for (const t of tambahanMatches) {
    if (directIds.has(t.parentSalesOrderId)) continue;
    matchNoteByParentId.set(
      t.parentSalesOrderId,
      t.convertedSoNumber && t.convertedSoNumber.toLowerCase().includes(q.toLowerCase())
        ? `matched via converted Tambahan → ${t.convertedSoNumber}`
        : `matched via Tambahan ${t.tambahanNumber}`
    );
  }

  const extraParents = extraParentIds.length
    ? await db.select().from(salesOrders).where(inArray(salesOrders.id, extraParentIds))
    : [];

  const allOrders = [...directMatches, ...extraParents];
  if (allOrders.length === 0) {
    return NextResponse.json([]);
  }

  // Picking and Shipping each show their own status (see lib/soProgress.ts).
  // This used to count every stock event — picks included — as shipped,
  // so a fully picked SO showed DONE in Shipping too.
  const progress = await getSoProgress(allOrders.map((o) => o.id));

  const result = allOrders
    .map((order) => {
      const p = progress.get(order.id)!;
      const matchNote = matchNoteByParentId.get(order.id);
      return {
        soNumber: order.soNumber,
        orderDate: order.orderDate,
        status: p.shipStatus, // kept for older PDA builds
        pickStatus: p.pickStatus,
        shipStatus: p.shipStatus,
        matchNote,
      };
    })
    .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  return NextResponse.json(result);
}