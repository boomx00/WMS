import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockColumns } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { denyUnlessAllowed } from "@/lib/pagePermissions";
import {
  cleanColumnName,
  cleanColumnTranslation,
  columnNameTaken,
  listStockColumnsWithCounts,
  nextColumnSortOrder,
} from "@/lib/stockColumns";
import { parseWarehouseId, resolveWarehouse } from "@/lib/warehouses";

// GET /api/stock-columns[?warehouseId=N] — one warehouse's Total Stock
// columns (or every warehouse's, without warehouseId) in display order,
// with how many locations show under each.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const warehouseId = parseWarehouseId(req.nextUrl.searchParams.get("warehouseId"));
  return NextResponse.json(await listStockColumnsWithCounts(db, warehouseId));
}

// POST /api/stock-columns
// body: { name, nameId?, nameZh?, warehouseId } — added at the end of that
// warehouse's list (the default warehouse when warehouseId is left out).
// nameId / nameZh: optional Indonesian / Chinese names.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const denied = await denyUnlessAllowed(session, "settings.edit", { webOnly: false });
  if (denied) return denied;

  const body = await req.json();
  const name = cleanColumnName(body?.name);
  if (!name) {
    return NextResponse.json({ error: "Column name is required" }, { status: 400 });
  }
  const resolved = await resolveWarehouse(db, body?.warehouseId);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const warehouseId = resolved.warehouse.id;
  if (await columnNameTaken(db, warehouseId, name)) {
    return NextResponse.json({ error: `This warehouse already has a column named "${name}"` }, { status: 409 });
  }

  const [created] = await db
    .insert(stockColumns)
    .values({
      warehouseId,
      name,
      nameId: cleanColumnTranslation(body?.nameId),
      nameZh: cleanColumnTranslation(body?.nameZh),
      sortOrder: await nextColumnSortOrder(db, warehouseId),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
