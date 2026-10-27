import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, k3StockImports, k3StockLines, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { resolveWarehouse } from "@/lib/warehouses";
import { cleanDate } from "@/lib/skuOpnameSummary";

export const dynamic = "force-dynamic";

const MAX_ROWS = 100_000;
const GOOD_STOCK = "good stock";
// Only stock K3 holds in this warehouse (its Warehouse Name column) counts.
// Compared ignoring case and repeated spaces.
const K3_WAREHOUSE = "MCI Warehouse";

type IncomingRow = { code?: unknown; name?: unknown; warehouse?: unknown; status?: unknown; quantity?: unknown };

const clean = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\0/g, "").trim();
const stripZeros = (code: string) => code.replace(/^0+/, "");
const sameName = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, " ") === b.toLowerCase().replace(/\s+/g, " ");
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function toQuantity(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = clean(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// POST /api/stock-opname/summary/k3
// body: { warehouseId, date: "YYYY-MM-DD", fileName, rows: [{ code, name, warehouse, status, quantity }] }
//
// Imports K3's "Real-time Inventory" export (read in the browser) for one
// date column of the Stock Opname Summary. Only rows whose Warehouse Name is
// MCI Warehouse and whose Inventory Status is Good Stock count; their
// Inventory Qty (CUoM) is summed per Material
// Code, which is matched to items.sku (then items.legacySku, then either of
// them ignoring leading zeros, for codes Excel stored as numbers). Replaces
// any earlier import for the same warehouse + date.
//
// Returns { import: { date, fileName, importedAt, by, k3Warehouse, goodStockRows,
//   matchedSkus, totalQuantity, unmatched: [{ code, name, quantity }] } }
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
  const fileName = clean(body.fileName).slice(0, 255) || null;

  const rows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "The file has no rows" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS.toLocaleString()})` }, { status: 400 });
  }

  // MCI Warehouse's Good Stock rows, summed per material code.
  const byCode = new Map<string, { name: string | null; quantity: number }>();
  const otherWarehouses = new Set<string>();
  let goodStockRows = 0;
  for (const row of rows) {
    if (clean(row.status).toLowerCase() !== GOOD_STOCK) continue;
    const k3Warehouse = clean(row.warehouse);
    if (!sameName(k3Warehouse, K3_WAREHOUSE)) {
      if (k3Warehouse) otherWarehouses.add(k3Warehouse);
      continue;
    }
    const code = clean(row.code);
    const quantity = toQuantity(row.quantity);
    if (!code || quantity === null) continue;
    goodStockRows++;
    const entry = byCode.get(code) ?? { name: clean(row.name) || null, quantity: 0 };
    entry.quantity += quantity;
    byCode.set(code, entry);
  }
  if (goodStockRows === 0) {
    const seen = [...otherWarehouses].sort();
    return NextResponse.json(
      {
        error:
          `No "Good Stock" rows in ${K3_WAREHOUSE} were found in the file` +
          (seen.length > 0 ? ` (warehouses in the file: ${seen.slice(0, 10).join(", ")}${seen.length > 10 ? ", …" : ""})` : ""),
      },
      { status: 400 }
    );
  }

  // Material code -> item: exact sku, exact legacy sku, then either one with
  // leading zeros ignored (only when that's unambiguous).
  const itemRows = await db.select({ id: items.id, sku: items.sku, legacySku: items.legacySku }).from(items);
  const exact = new Map<string, number>();
  for (const it of itemRows) if (it.legacySku) exact.set(it.legacySku.trim(), it.id);
  for (const it of itemRows) exact.set(it.sku.trim(), it.id); // a sku wins over another item's legacy sku
  const loose = new Map<string, number | null>(); // null = more than one item, so no match
  for (const it of itemRows) {
    for (const code of [it.sku, it.legacySku]) {
      const z = code ? stripZeros(code.trim()) : "";
      if (z) loose.set(z, loose.has(z) && loose.get(z) !== it.id ? null : it.id);
    }
  }

  const qtyByItem = new Map<number, number>();
  const unmatched: { code: string; name: string | null; quantity: number }[] = [];
  for (const [code, { name, quantity }] of byCode) {
    const itemId = exact.get(code) ?? loose.get(stripZeros(code)) ?? null;
    if (itemId === null) {
      unmatched.push({ code, name, quantity: round3(quantity) });
      continue;
    }
    qtyByItem.set(itemId, (qtyByItem.get(itemId) ?? 0) + quantity);
  }
  unmatched.sort((a, b) => a.code.localeCompare(b.code));

  const importedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(k3StockImports)
      .where(and(eq(k3StockImports.warehouseId, warehouse.id), eq(k3StockImports.stockDate, date)));
    const [created] = await tx
      .insert(k3StockImports)
      .values({
        warehouseId: warehouse.id,
        stockDate: date,
        fileName,
        goodStockRows,
        unmatched,
        importedBy: session.userId,
        importedAt,
      })
      .returning({ id: k3StockImports.id });
    const lines = [...qtyByItem].map(([itemId, quantity]) => ({
      importId: created.id,
      itemId,
      quantity: round3(quantity),
    }));
    for (let i = 0; i < lines.length; i += 1000) {
      await tx.insert(k3StockLines).values(lines.slice(i, i + 1000));
    }
  });

  const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, session.userId));

  return NextResponse.json({
    import: {
      date,
      fileName,
      importedAt: formatJakarta(importedAt),
      by: user?.username ?? null,
      k3Warehouse: K3_WAREHOUSE,
      goodStockRows,
      matchedSkus: qtyByItem.size,
      totalQuantity: round3([...qtyByItem.values()].reduce((a, b) => a + b, 0)),
      unmatched,
    },
  });
}

// DELETE /api/stock-opname/summary/k3?warehouseId=N&date=YYYY-MM-DD
// Removes that date's K3 import (the K3 columns disappear from it).
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const date = cleanDate(params.get("date"));
  if (!date) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  const resolved = await resolveWarehouse(db, params.get("warehouseId"));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  await db
    .delete(k3StockImports)
    .where(and(eq(k3StockImports.warehouseId, resolved.warehouse.id), eq(k3StockImports.stockDate, date)));

  return NextResponse.json({ ok: true });
}

// Same display format as the summary (24-hour, Asia/Jakarta).
function formatJakarta(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}