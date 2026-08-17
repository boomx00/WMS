import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname } from "@/db/schema";
import { like, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// POST /api/stock-opname/custom
// body: { notes? }
// Creates a session the current user owns, with no pre-planned locations —
// scanning during counting is what populates it, in real time.
// ID format: CSO-{userId}-{attemptNumber}
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  const prefix = `CSO-${session.userId}-`;

  const existingAttempts = await db
    .select({ opnameNumber: stockOpname.opnameNumber })
    .from(stockOpname)
    .where(like(stockOpname.opnameNumber, `${prefix}%`))
    .orderBy(desc(stockOpname.opnameNumber));

  let nextAttempt = 1;
  if (existingAttempts.length > 0) {
    const numbers = existingAttempts
      .map((r) => {
        const suffix = r.opnameNumber.slice(prefix.length);
        const n = parseInt(suffix, 10);
        return isNaN(n) ? 0 : n;
      })
      .filter((n) => n > 0);
    if (numbers.length > 0) {
      nextAttempt = Math.max(...numbers) + 1;
    }
  }

  const opnameNumber = `${prefix}${nextAttempt}`;

  const [opname] = await db
    .insert(stockOpname)
    .values({
      opnameNumber,
      notes: notes || null,
      createdBy: session.userId,
      assignedTo: session.userId,
    })
    .returning();

  return NextResponse.json(opname, { status: 201 });
}