import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname, stockOpnameItems } from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// GET /api/stock-opname/my-sessions
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const sessions = await db
    .select()
    .from(stockOpname)
    .where(eq(stockOpname.assignedTo, session.userId))
    .orderBy(desc(stockOpname.createdAt));

  if (sessions.length === 0) return NextResponse.json([]);

  const opnameNumbers = sessions.map((s) => s.opnameNumber);

  const progressRows = await db
    .select({
      opnameNumber: stockOpnameItems.opnameNumber,
      total: sql<number>`count(*)::int`,
      counted: sql<number>`count(${stockOpnameItems.countedQty})::int`,
    })
    .from(stockOpnameItems)
    .where(inArray(stockOpnameItems.opnameNumber, opnameNumbers))
    .groupBy(stockOpnameItems.opnameNumber);

  const progressMap = new Map(progressRows.map((r) => [r.opnameNumber, r]));

  const result = sessions.map((s) => {
    const progress = progressMap.get(s.opnameNumber);
    const total = progress?.total ?? 0;
    const counted = progress?.counted ?? 0;
    const status = total === 0 || counted === 0 ? "PENDING" : counted >= total ? "DONE" : "IN_PROGRESS";
    return { opnameNumber: s.opnameNumber, notes: s.notes, totalLines: total, countedLines: counted, status };
  });

  return NextResponse.json(result);
}