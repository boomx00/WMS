import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameLocations, locations, items, users, locationStock } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// A handful of code paths (and possibly older rows) can end up with the
// literal 4-character string "null" instead of a true SQL NULL — that
// isn't caught by `?? "—"`, which only handles a real null/undefined.
// This normalizes both cases to a clean "—" for display.
function cleanSystemSku(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return "—";
  return trimmed;
}

// Product names aren't snapshotted historically — only the SKU codes are
// (in stock_opname_items.systemSku). This looks up CURRENT names for
// whatever SKU codes appear in any snapshot, purely for display, so
// "System SKU (at Count)" can show "SKU Name" instead of a bare code.
function formatSkuWithNames(csv: string, nameBySku: Map<string, string>): string {
  if (csv === "—") return "—";
  const skus = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (skus.length === 0) return "—";
  return skus.map((s) => `${s} ${nameBySku.get(s.toUpperCase()) ?? ""}`.trim()).join(", ");
}

// GET /api/stock-opname/:opnameNumber/report
// The full picture for one session: who it's assigned to, every location
// in scope, and — for each one — whatever's actually been counted there
// so far.
//
// Two distinct "system" comparisons are shown, on purpose:
//   - System SKU / System Qty: read from the snapshot stored on
//     stock_opname_items at count time — a faithful record of what the
//     system believed THEN, unaffected by anything that's happened since
//     (including this session's own Adjust actions). Rows counted before
//     this snapshot existed will show "—" here; that's expected, not a
//     bug — there's no way to retroactively know a past system state.
//   - Current System SKU / Current System Product: a fresh, live lookup
//     of location_stock at report-view time — what's actually there
//     RIGHT NOW, which may differ from the snapshot if anything moved,
//     shipped, or was adjusted since the count was taken.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const { opnameNumber } = await params;

  const [opname] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!opname) {
    return NextResponse.json({ error: "Opname session not found" }, { status: 404 });
  }

  let assignedToUsername: string | null = null;
  if (opname.assignedTo) {
    const [assignee] = await db.select().from(users).where(eq(users.id, opname.assignedTo));
    assignedToUsername = assignee?.username ?? null;
  }

  const allLocations = await db
    .select({
      locationId: stockOpnameLocations.locationId,
      locationCode: locations.code,
      area: locations.area,
      x: locations.x,
      y: locations.y,
    })
    .from(stockOpnameLocations)
    .innerJoin(locations, eq(stockOpnameLocations.locationId, locations.id))
    .where(eq(stockOpnameLocations.opnameNumber, opnameNumber))
    .orderBy(locations.area, locations.x, locations.y);

  const countedRows = await db
    .select({
      locationId: stockOpnameItems.locationId,
      itemId: stockOpnameItems.itemId,
      itemSku: items.sku,
      itemName: items.name,
      systemQty: stockOpnameItems.systemQty,
      systemSku: stockOpnameItems.systemSku,
      countedQty: stockOpnameItems.countedQty,
      difference: stockOpnameItems.difference,
      countedAt: stockOpnameItems.countedAt,
      countedByUsername: users.username,
    })
    .from(stockOpnameItems)
    .innerJoin(items, eq(stockOpnameItems.itemId, items.id))
    .leftJoin(users, eq(stockOpnameItems.countedBy, users.id))
    .where(eq(stockOpnameItems.opnameNumber, opnameNumber));

  const countedByLocation = new Map<number, typeof countedRows>();
  for (const row of countedRows) {
    if (!countedByLocation.has(row.locationId)) countedByLocation.set(row.locationId, []);
    countedByLocation.get(row.locationId)!.push(row);
  }

  // Every distinct SKU code referenced in any historical snapshot, so we
  // can resolve their current names for display (only the SKU codes were
  // ever snapshotted, not names).
  const snapshotSkuSet = new Set<string>();
  for (const row of countedRows) {
    const cleaned = cleanSystemSku(row.systemSku);
    if (cleaned === "—") continue;
    cleaned
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => snapshotSkuSet.add(s));
  }

  const snapshotNameBySku = new Map<string, string>();
  if (snapshotSkuSet.size > 0) {
    const snapshotItems = await db
      .select({ sku: items.sku, name: items.name })
      .from(items)
      .where(inArray(items.sku, Array.from(snapshotSkuSet)));
    for (const i of snapshotItems) snapshotNameBySku.set(i.sku.toUpperCase(), i.name);
  }

  // Live current-system lookup — computed fresh every time this report
  // loads, deliberately independent of the historical snapshot above.
  const locationIds = allLocations.map((l) => l.locationId);
  const liveStockRows =
    locationIds.length > 0
      ? await db
          .select({
            locationId: locationStock.locationId,
            itemSku: items.sku,
            itemName: items.name,
            quantity: locationStock.quantity,
          })
          .from(locationStock)
          .innerJoin(items, eq(locationStock.itemId, items.id))
          .where(inArray(locationStock.locationId, locationIds))
      : [];

  const liveByLocation = new Map<number, { sku: string; name: string; quantity: number }[]>();
  for (const row of liveStockRows) {
    if (row.quantity === 0) continue;
    if (!liveByLocation.has(row.locationId)) liveByLocation.set(row.locationId, []);
    liveByLocation.get(row.locationId)!.push({ sku: row.itemSku, name: row.itemName, quantity: row.quantity });
  }

  const report = allLocations.map((loc) => {
    const counts = countedByLocation.get(loc.locationId) ?? [];
    const liveEntries = liveByLocation.get(loc.locationId) ?? [];
    const currentSystemQty = liveEntries.reduce((sum, e) => sum + e.quantity, 0);

    return {
      locationCode: loc.locationCode,
      counted: counts.length > 0,
      currentSystemStock: liveEntries.map((e) => ({ sku: e.sku, name: e.name, quantity: e.quantity })),
      currentSystemQty,
      items: counts.map((c) => {
        const cleanedSystemSku = cleanSystemSku(c.systemSku);
        const systemSkuList =
          cleanedSystemSku === "—"
            ? []
            : cleanedSystemSku
                .split(",")
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
        return {
          itemId: c.itemId,
          itemSku: c.itemSku,
          itemName: c.itemName,
          systemQty: c.systemQty,
          systemSku: formatSkuWithNames(cleanedSystemSku, snapshotNameBySku),
          countedQty: c.countedQty,
          difference: c.difference,
          countedAt: c.countedAt,
          countedByUsername: c.countedByUsername,
          skuMatch: systemSkuList.includes(c.itemSku.toUpperCase())
            ? ("MATCH" as const)
            : ("MISMATCH" as const),
        };
      }),
    };
  });

  return NextResponse.json({
    opnameNumber: opname.opnameNumber,
    notes: opname.notes,
    assignedToUsername,
    totalLocations: allLocations.length,
    countedLocations: report.filter((r) => r.counted).length,
    report,
  });
}