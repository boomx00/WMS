import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { csoSummaries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/stock-opname/cso-summaries/:id
// Deletes a CSO Summary and its locked stock (cso_summary_stock cascades).
// The CSO sessions themselves and their counts are not touched.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid summary id" }, { status: 400 });
  }

  const deleted = await db.delete(csoSummaries).where(eq(csoSummaries.id, id)).returning({ id: csoSummaries.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Summary not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
