import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { csoSummaries, csoSummaryStock, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/stock-opname/cso-summaries
// Every CSO Summary (newest first) for the cards on Verify Stock Integrity →
// CSO Summary: its name, when and by whom it was created (= when the stock was
// locked), how much stock it locked, and the CSO sessions last combined in it.
export async function GET() {
  const totals = db
    .select({
      summaryId: csoSummaryStock.summaryId,
      lines: sql<number>`count(*)`.mapWith(Number).as("lines"),
      skus: sql<number>`count(distinct ${csoSummaryStock.itemId})`.mapWith(Number).as("skus"),
      locations: sql<number>`count(distinct ${csoSummaryStock.locationId})`.mapWith(Number).as("locations"),
      quantity: sql<number>`coalesce(sum(${csoSummaryStock.quantity}), 0)`.mapWith(Number).as("quantity"),
      loosePacks: sql<number>`coalesce(sum(${csoSummaryStock.loosePacks}), 0)`.mapWith(Number).as("loose_packs"),
    })
    .from(csoSummaryStock)
    .groupBy(csoSummaryStock.summaryId)
    .as("totals");

  const rows = await db
    .select({
      id: csoSummaries.id,
      name: csoSummaries.name,
      opnameNumbers: csoSummaries.opnameNumbers,
      createdAt: sql<string>`to_char(${csoSummaries.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI')`,
      createdBy: users.username,
      skus: totals.skus,
      locations: totals.locations,
      quantity: totals.quantity,
      loosePacks: totals.loosePacks,
    })
    .from(csoSummaries)
    .leftJoin(users, eq(users.id, csoSummaries.createdBy))
    .leftJoin(totals, eq(totals.summaryId, csoSummaries.id))
    .orderBy(desc(csoSummaries.createdAt), desc(csoSummaries.id));

  return NextResponse.json({
    summaries: rows.map((r) => ({
      ...r,
      skus: r.skus ?? 0,
      locations: r.locations ?? 0,
      quantity: r.quantity ?? 0,
      loosePacks: r.loosePacks ?? 0,
    })),
  });
}

// POST /api/stock-opname/cso-summaries
// body: { name: string }
//
// Creates a CSO Summary and locks the whole system stock into it: a copy of
// every location_stock row that has stock right now. The copy is one
// INSERT ... SELECT, so it is a consistent picture of the stock at a single
// moment even while people keep moving stock.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Activity name is required" }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: "Activity name is too long (200 characters max)" }, { status: 400 });
  }

  const created = await db.transaction(async (tx) => {
    const [summary] = await tx
      .insert(csoSummaries)
      .values({ name, createdBy: session.userId })
      .returning({ id: csoSummaries.id });

    await tx.execute(sql`
      INSERT INTO cso_summary_stock (summary_id, location_id, item_id, quantity, loose_packs)
      SELECT ${summary.id}, location_id, item_id, quantity, loose_packs
      FROM location_stock
      WHERE quantity <> 0 OR loose_packs <> 0
    `);

    const [locked] = await tx
      .select({ lines: sql<number>`count(*)`.mapWith(Number) })
      .from(csoSummaryStock)
      .where(eq(csoSummaryStock.summaryId, summary.id));

    return { id: summary.id, lockedLines: locked?.lines ?? 0 };
  });

  return NextResponse.json({ id: created.id, name, lockedLines: created.lockedLines });
}
