import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems, users, stockOpnameLocations } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
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
    })
    .from(stockOpnameItems)
    .groupBy(stockOpnameItems.opnameNumber);

  const totalMap = new Map(locationRows.map((r) => [r.opnameNumber, r.total]));
  const countedMap = new Map(countedRows.map((r) => [r.opnameNumber, r.counted]));

  const assigneeRows = await db.select().from(users);
  const usersById = new Map(assigneeRows.map((u) => [u.id, u.username]));

  return sessions.map((s) => {
    const total = totalMap.get(s.opnameNumber) ?? 0;
    const counted = countedMap.get(s.opnameNumber) ?? 0;
    const status = s.completedAt
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