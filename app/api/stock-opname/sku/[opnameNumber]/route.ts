import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSkuOpnameSkus } from "@/lib/skuOpnameTotals";
import { getSession } from "@/lib/auth";
import { isSkuOpname } from "@/lib/skuOpname";

// GET /api/stock-opname/sku/:opnameNumber
// Everything about one per-SKU session: each SKU added to it with its LOCKED
// system quantity, how much has been counted in total, and the per-location
// lines behind that (system qty as it stood when each location was counted,
// the counted qty, and the difference — 0 means it matches). Totals on the
// Total Stock basis, packs rebuilt from the ledger: see lib/skuOpnameTotals.ts.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname || !isSkuOpname(opnameNumber)) {
    return NextResponse.json({ error: "SKU opname session not found" }, { status: 404 });
  }

  const skus = (await getSkuOpnameSkus(db, [opnameNumber])).get(opnameNumber) ?? [];

  return NextResponse.json({
    opnameNumber,
    finished: opname.completedAt !== null,
    skus,
  });
}