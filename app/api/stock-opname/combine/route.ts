import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  stockOpname,
  stockOpnameItems,
  stockOpnameLocations,
  locationStock,
  items,
  locations,
  locationTypes,
  users,
  k3StockImports,
  k3StockImportSessions,
  k3StockLines,
} from "@/db/schema";
import { eq, inArray, ilike, sql, desc } from "drizzle-orm";
import { isOpenPickArea } from "@/lib/locationRules";

// GET /api/stock-opname/combine
// Lists every stock opname session whose opnameNumber starts with "CSO-"
// (the convention for an individual counter's own section of a combined,
// multi-person opname — e.g. CSO-Budi-01, CSO-Siti-02) along with its
// counted/total line counts, so the Combine CSO panel can offer them for
// selection.
export async function GET() {
  const sessions = await db
    .select()
    .from(stockOpname)
    .where(ilike(stockOpname.opnameNumber, "CSO-%"))
    .orderBy(desc(stockOpname.createdAt));

  const opnameNumbers = sessions.map((s) => s.opnameNumber);

  const totalRows =
    opnameNumbers.length > 0
      ? await db
          .select({
            opnameNumber: stockOpnameLocations.opnameNumber,
            total: sql<number>`count(*)`.mapWith(Number),
          })
          .from(stockOpnameLocations)
          .where(inArray(stockOpnameLocations.opnameNumber, opnameNumbers))
          .groupBy(stockOpnameLocations.opnameNumber)
      : [];

  const countedRows =
    opnameNumbers.length > 0
      ? await db
          .select({
            opnameNumber: stockOpnameItems.opnameNumber,
            counted: sql<number>`count(distinct ${stockOpnameItems.locationId})`.mapWith(Number),
          })
          .from(stockOpnameItems)
          .where(inArray(stockOpnameItems.opnameNumber, opnameNumbers))
          .groupBy(stockOpnameItems.opnameNumber)
      : [];

  const totalMap = new Map(totalRows.map((r) => [r.opnameNumber, r.total]));
  const countedMap = new Map(countedRows.map((r) => [r.opnameNumber, r.counted]));

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      opnameNumber: s.opnameNumber,
      notes: s.notes,
      completedAt: s.completedAt,
      totalLines: totalMap.get(s.opnameNumber) ?? 0,
      countedLines: countedMap.get(s.opnameNumber) ?? 0,
    })),
  });
}

function sanitizeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((v) => String(v).trim()).filter(Boolean);
}

type ReportColumn = { key: string; label: string };

// Which column of the SKU Summary a location's stock goes in: Defect, Floor,
// Rack, or a column of its own (Export, Outbound WH, ...). DEFECT and EXPOR are
// floor-type locations told apart by their code.
function columnOf(location: { code: string; hasPosition: boolean; pickable: boolean }): ReportColumn {
  const code = location.code.trim().toUpperCase();
  if (code === "DEFECT") return { key: "defect", label: "Defect" };
  if (location.hasPosition) return { key: "rack", label: "Rack" };
  if (code !== "EXPOR" && isOpenPickArea(location)) return { key: "floor", label: "Floor" };
  return { key: `loc:${location.code}`, label: location.code };
}

const BASE_COLUMNS: ReportColumn[] = [
  { key: "defect", label: "Defect" },
  { key: "floor", label: "Floor" },
  { key: "rack", label: "Rack" },
];

const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

// POST /api/stock-opname/combine
// body: { opnameNumbers: string[] }
//
// The data behind Combine & Compare's report. Compares against live
// location_stock, and only K3 imports are stored by the page: stock is never
// changed.
//
//   locations: every rack, and every other location the selected sessions
//   counted, with what the system has there and each session's count. The page
//   works out the rows and statuses, since those depend on which session the
//   person picks where sessions disagree.
//
//   items: system quantity per SKU and report column across EVERY location,
//   plus the SKU's K3 quantity. The counted side is added up by the page too.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const opnameNumbers = sanitizeList(body.opnameNumbers);

  if (opnameNumbers.length === 0) {
    return NextResponse.json({ error: "At least one opnameNumber is required" }, { status: 400 });
  }

  const [locationRows, lineRows, stockRows, itemRows, k3Links] = await Promise.all([
    db
      .select({
        id: locations.id,
        code: locations.code,
        hasPosition: locationTypes.hasPosition,
        pickable: locationTypes.pickable,
        allowsMultipleSku: locationTypes.allowsMultipleSku,
      })
      .from(locations)
      .innerJoin(locationTypes, eq(locations.type, locationTypes.code)),
    db
      .select({
        locationId: stockOpnameItems.locationId,
        itemId: stockOpnameItems.itemId,
        opnameNumber: stockOpnameItems.opnameNumber,
        countedQty: stockOpnameItems.countedQty,
        countedBy: users.username,
      })
      .from(stockOpnameItems)
      .leftJoin(users, eq(stockOpnameItems.countedBy, users.id))
      .where(inArray(stockOpnameItems.opnameNumber, opnameNumbers)),
    db
      .select({ locationId: locationStock.locationId, itemId: locationStock.itemId, quantity: locationStock.quantity })
      .from(locationStock),
    db.select({ id: items.id, sku: items.sku, name: items.name }).from(items),
    db
      .select({
        importId: k3StockImportSessions.importId,
        opnameNumber: k3StockImportSessions.opnameNumber,
        fileName: k3StockImports.fileName,
        unmatched: k3StockImports.unmatched,
        importedAtRaw: k3StockImports.importedAt,
        importedAt: sql<string>`to_char(${k3StockImports.importedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`,
        by: users.username,
      })
      .from(k3StockImportSessions)
      .innerJoin(k3StockImports, eq(k3StockImports.id, k3StockImportSessions.importId))
      .leftJoin(users, eq(users.id, k3StockImports.importedBy))
      .where(inArray(k3StockImportSessions.opnameNumber, opnameNumbers)),
  ]);

  const itemById = new Map(itemRows.map((i) => [i.id, i]));
  const columnByLocation = new Map(locationRows.map((l) => [l.id, columnOf(l)]));

  const itemInfo = (itemId: number) => ({
    itemId,
    sku: itemById.get(itemId)?.sku ?? `#${itemId}`,
    name: itemById.get(itemId)?.name ?? "(unknown item)",
  });

  // What the selected sessions counted, per location.
  const countsByLocation = new Map<
    number,
    {
      opnameNumber: string;
      countedBy: string | null;
      itemId: number | null;
      sku: string | null;
      name: string | null;
      qty: number;
    }[]
  >();
  for (const line of lineRows) {
    if (!countsByLocation.has(line.locationId)) countsByLocation.set(line.locationId, []);
    countsByLocation.get(line.locationId)!.push({
      opnameNumber: line.opnameNumber,
      countedBy: line.countedBy,
      ...(line.itemId === null ? { itemId: null, sku: null, name: null } : itemInfo(line.itemId)),
      qty: line.countedQty ?? 0,
    });
  }

  // What the system has, per location and per SKU + column.
  const systemByLocation = new Map<number, { itemId: number; sku: string; name: string; qty: number }[]>();
  const systemByItem = new Map<number, Record<string, number>>();
  for (const row of stockRows) {
    if (!systemByItem.has(row.itemId)) systemByItem.set(row.itemId, {});
    const column = columnByLocation.get(row.locationId);
    if (column) {
      const figures = systemByItem.get(row.itemId)!;
      figures[column.key] = (figures[column.key] ?? 0) + row.quantity;
    }
    if (row.quantity === 0) continue;
    if (!systemByLocation.has(row.locationId)) systemByLocation.set(row.locationId, []);
    systemByLocation.get(row.locationId)!.push({ ...itemInfo(row.itemId), qty: row.quantity });
  }

  // Every rack (opnamed or not), then whatever else was counted.
  const shownLocations = locationRows
    .filter((l) => l.hasPosition || countsByLocation.has(l.id))
    .sort((a, b) => Number(b.hasPosition) - Number(a.hasPosition) || byCode(a.code, b.code));

  // Defect, Floor, Rack, then each other location with stock or a count.
  const otherColumns = new Map<string, ReportColumn>();
  for (const l of locationRows) {
    const column = columnByLocation.get(l.id)!;
    if (BASE_COLUMNS.some((b) => b.key === column.key)) continue;
    if (countsByLocation.has(l.id) || systemByLocation.has(l.id)) otherColumns.set(column.key, column);
  }
  const columns = [...BASE_COLUMNS, ...[...otherColumns.values()].sort((a, b) => byCode(a.label, b.label))];

  const racks = locationRows.filter((l) => l.hasPosition);
  const racksOpnamed = racks.filter((l) => countsByLocation.has(l.id)).length;

  // K3: one file per report, the newest one imported for a selected session.
  const newestLink = k3Links.reduce<(typeof k3Links)[number] | null>(
    (newest, link) => (!newest || link.importedAtRaw > newest.importedAtRaw ? link : newest),
    null
  );
  const k3Lines = newestLink
    ? await db
        .select({ itemId: k3StockLines.itemId, quantity: k3StockLines.quantity })
        .from(k3StockLines)
        .where(eq(k3StockLines.importId, newestLink.importId))
    : [];
  const k3ByItem = new Map(k3Lines.map((l) => [l.itemId, l.quantity]));

  const allItemIds = new Set<number>([...systemByItem.keys(), ...k3ByItem.keys()]);
  for (const line of lineRows) if (line.itemId !== null) allItemIds.add(line.itemId);

  return NextResponse.json({
    opnameNumbers,
    sessionCount: opnameNumbers.length,
    emptyConfirmations: lineRows.filter((l) => l.itemId === null).length,
    rackCoverage: {
      total: racks.length,
      opnamed: racksOpnamed,
      notOpnamed: racks.length - racksOpnamed,
    },
    columns,
    locations: shownLocations.map((location) => ({
      locationCode: location.code,
      column: columnByLocation.get(location.id)!.key,
      allowsMultipleSku: location.allowsMultipleSku,
      opnamed: countsByLocation.has(location.id),
      system: systemByLocation.get(location.id) ?? [],
      counts: countsByLocation.get(location.id) ?? [],
    })),
    items: [...allItemIds].map((itemId) => ({
      ...itemInfo(itemId),
      system: systemByItem.get(itemId) ?? {},
      k3Qty: k3ByItem.get(itemId) ?? null,
    })),
    k3: newestLink
      ? {
          fileName: newestLink.fileName,
          importedAt: newestLink.importedAt,
          by: newestLink.by,
          sessions: k3Links
            .filter((l) => l.importId === newestLink.importId)
            .map((l) => l.opnameNumber)
            .sort(byCode),
          matchedSkus: k3Lines.length,
          totalQuantity: Math.round(k3Lines.reduce((sum, l) => sum + l.quantity, 0) * 1000) / 1000,
          unmatched: newestLink.unmatched,
        }
      : null,
  });
}
