import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getWarehouses, resolveWarehouse } from "@/lib/warehouses";
import { cleanDate } from "@/lib/skuOpnameSummary";
import { getWeekRange, planStockOpname, type ProductionPlanRow, type ShippingPlanRow } from "@/lib/stockOpnamePlan";
import { getGoodStock, getOpnamedSkus } from "@/lib/stockOpnamePlanStock";

export const dynamic = "force-dynamic";

const MAX_ROWS = 20_000;

const clean = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\0/g, "").trim();

// POST /api/stock-opname/plan
// body: { warehouseId?, date: "YYYY-MM-DD",
//         productionPlan: [{ date, shift: "A" | "B", sku }],
//         shippingPlan: [{ docNo, sku, status }] }
//
// Which SKUs to count in each warehouse shift (lib/stockOpnamePlan.ts). The
// two plans are read in the browser; stock and this week's opnames come from
// the WMS. Nothing is saved.
//
// Returns { warehouse: { id, name }, warehouses: [{ id, name, isActive }], plan }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const date = cleanDate(typeof body.date === "string" ? body.date : null);
  if (!date) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  const resolved = await resolveWarehouse(db, body.warehouseId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { warehouse } = resolved;

  const rawProduction: unknown[] = Array.isArray(body.productionPlan) ? body.productionPlan : [];
  const rawShipping: unknown[] = Array.isArray(body.shippingPlan) ? body.shippingPlan : [];
  if (rawProduction.length > MAX_ROWS || rawShipping.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS.toLocaleString()})` }, { status: 400 });
  }

  const productionPlan: ProductionPlanRow[] = [];
  for (const row of rawProduction as Record<string, unknown>[]) {
    const rowDate = cleanDate(clean(row?.date));
    const shift = clean(row?.shift).toUpperCase();
    const sku = clean(row?.sku);
    if (rowDate && sku && (shift === "A" || shift === "B")) productionPlan.push({ date: rowDate, shift, sku });
  }
  const shippingPlan: ShippingPlanRow[] = [];
  for (const row of rawShipping as Record<string, unknown>[]) {
    const docNo = clean(row?.docNo);
    const sku = clean(row?.sku);
    if (docNo && sku) shippingPlan.push({ docNo, sku, status: clean(row?.status) });
  }

  let goodStock: Awaited<ReturnType<typeof getGoodStock>>;
  try {
    goodStock = await getGoodStock(db, warehouse.id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't read Good Stock" }, { status: 400 });
  }

  const week = getWeekRange(date);
  const [counted, warehouses] = await Promise.all([getOpnamedSkus(db, week.from, week.to), getWarehouses(db)]);

  const plan = planStockOpname({
    date,
    stock: goodStock.stock,
    skuAliases: goodStock.skuAliases,
    productionPlan,
    shippingPlan,
    counted,
  });

  return NextResponse.json({
    warehouse: { id: warehouse.id, name: warehouse.name },
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, isActive: w.isActive })),
    plan,
  });
}
