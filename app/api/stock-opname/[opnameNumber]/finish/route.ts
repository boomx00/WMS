import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpname } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

// PATCH /api/stock-opname/:opnameNumber/finish
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ opnameNumber: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { opnameNumber } = await params;

  const [existing] = await db.select().from(stockOpname).where(eq(stockOpname.opnameNumber, opnameNumber));
  if (!existing) {
    return NextResponse.json({ error: "Opname session not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(stockOpname)
    .set({ completedAt: new Date() })
    .where(eq(stockOpname.opnameNumber, opnameNumber))
    .returning();

  return NextResponse.json(updated);
}