import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesOrders } from "@/db/schema";
import { getSoProgress, type SoStage } from "@/lib/soProgress";

export const dynamic = "force-dynamic";

// GET /api/sales-orders/open-list
// Every SO that isn't fully shipped, for the PDA's Picking and Shipping lists.
//   pickStatus — shown on Picking (DONE once every line is fully picked)
//   shipStatus — shown on Shipping (DONE once every line is fully shipped)
//   status     — same as shipStatus, kept for older PDA builds
export async function GET() {
  const [orders, progress] = await Promise.all([
    db.select().from(salesOrders),
    getSoProgress(),
  ]);

  const rank = (s: SoStage) => (s === "IN_PROGRESS" ? 0 : s === "PENDING" ? 1 : 2);

  const result = orders
    .map((order) => {
      const p = progress.get(order.id) ?? { pickStatus: "PENDING", shipStatus: "PENDING" };
      return {
        soNumber: order.soNumber,
        orderDate: order.orderDate,
        status: p.shipStatus,
        pickStatus: p.pickStatus,
        shipStatus: p.shipStatus,
      };
    })
    .filter((order) => order.shipStatus !== "DONE")
    .sort((a, b) => {
      if (a.shipStatus !== b.shipStatus) return rank(a.shipStatus) - rank(b.shipStatus);
      return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
    });

  return NextResponse.json(result);
}
