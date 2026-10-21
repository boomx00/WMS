import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, stockOpnameSkus, users, stockOpnameLocations, bulkAdjustments } from "@/db/schema";
import { desc, sql, isNotNull } from "drizzle-orm";
import { isSkuOpname } from "@/lib/skuOpname";
import StockOpnameClient from "./StockOpnameClient";

export const dynamic = "force-dynamic";

async function getSessions() {
  const sessions = await db.select().from(stockOpname).orderBy(desc(stockOpname.createdAt));

  const locationRows = await db
    .select({
      opnameNumber: stockOpnameLocations.opnameNumber,
      total: sql<number>`count(*)::int`,
    })
    .from(stockOpnameLocations)
    .groupBy(stockOpnameLocations.opnameNumber);

  const countedRows = await db
    .select({
      opnameNumber: stockOpnameItems.opnameNumber,
      counted: sql<number>`count(distinct ${stockOpnameItems.locationId})::int`,
      // Explicitly formatted as an ISO string with a literal "Z" — a bare
      // `min(counted_at)` can come back as a wall-clock string with no
      // timezone marker, which the browser's `new Date(...)` can then
      // misinterpret as local time instead of UTC, shifting the displayed
      // hour depending on server/DB timezone assumptions. This removes
      // that ambiguity at the source.
      commencedAt: sql<string | null>`to_char(min(${stockOpnameItems.countedAt}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
    })
    .from(stockOpnameItems)
    .groupBy(stockOpnameItems.opnameNumber);

  // Per-SKU (SOSKU-) sessions: the sum of every SKU's locked system quantity,
  // and the sum of everything counted so far.
  const skuLockedRows = await db
    .select({
      opnameNumber: stockOpnameSkus.opnameNumber,
      skuCount: sql<number>`count(*)::int`,
      lockedQty: sql<number>`coalesce(sum(${stockOpnameSkus.systemQty}), 0)::int`,
    })
    .from(stockOpnameSkus)
    .groupBy(stockOpnameSkus.opnameNumber);

  const skuCountedRows = await db
    .select({
      opnameNumber: stockOpnameItems.opnameNumber,
      countedQty: sql<number>`coalesce(sum(${stockOpnameItems.countedQty}), 0)::int`,
    })
    .from(stockOpnameItems)
    .where(isNotNull(stockOpnameItems.itemId))
    .groupBy(stockOpnameItems.opnameNumber);

  const skuLockedMap = new Map(skuLockedRows.map((r) => [r.opnameNumber, r]));
  const skuCountedMap = new Map(skuCountedRows.map((r) => [r.opnameNumber, r.countedQty]));

  const totalMap = new Map(locationRows.map((r) => [r.opnameNumber, r.total]));
  const countedMap = new Map(countedRows.map((r) => [r.opnameNumber, r.counted]));
  const commencedMap = new Map(countedRows.map((r) => [r.opnameNumber, r.commencedAt]));

  const assigneeRows = await db.select().from(users);
  const usersById = new Map(assigneeRows.map((u) => [u.id, u.username]));

  const adjustmentRows = await db.select().from(bulkAdjustments);
  const adjustmentCodeById = new Map(adjustmentRows.map((a) => [a.id, a.adjustmentCode]));

  return sessions.map((s) => {
    const total = totalMap.get(s.opnameNumber) ?? 0;
    const counted = countedMap.get(s.opnameNumber) ?? 0;
    const status = s.confirmedAt
      ? "CONFIRMED"
      : s.completedAt
        ? "DONE"
        : total === 0 || counted === 0
          ? "PENDING"
          : "IN_PROGRESS";
    return {
      ...s,
      assignedToUsername: s.assignedTo ? usersById.get(s.assignedTo) ?? null : null,
      totalLines: total,
      countedLines: counted,
      discrepancies: 0,
      status,
      isSkuSession: isSkuOpname(s.opnameNumber),
      skuCount: skuLockedMap.get(s.opnameNumber)?.skuCount ?? 0,
      skuLockedQty: skuLockedMap.get(s.opnameNumber)?.lockedQty ?? 0,
      skuCountedQty: skuCountedMap.get(s.opnameNumber) ?? 0,
      commencedAt: commencedMap.get(s.opnameNumber) ?? null,
      confirmedAdjustmentCode: s.confirmedBulkAdjustmentId
        ? adjustmentCodeById.get(s.confirmedBulkAdjustmentId) ?? null
        : null,
    };
  });
}

async function getUsers() {
  return db.select({ username: users.username }).from(users).orderBy(users.username);
}

export default async function StockOpnamePage() {
  const [sessions, userList] = await Promise.all([getSessions(), getUsers()]);

  return (
    <div className="p-8">
      <header className="mb-8 max-w-4xl">
        <h1 className="text-2xl font-semibold">Stock Opname</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Physical inventory counts, checked against system-recorded stock.
        </p>
      </header>

      {/* Not wrapped in max-w-4xl — the Verify Stock Integrity tab needs
          the full width of the main content area (up to the sidebar). */}
      <StockOpnameClient sessions={sessions} users={userList} />
    </div>
  );
}