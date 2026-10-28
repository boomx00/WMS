import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stockOpnameSkus, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { isSkuOpname } from "@/lib/skuOpname";

const MAX_QTY = 100_000_000;

function sanitize(input: unknown): string {
  return typeof input === "string" ? input.replace(/\0/g, "").trim() : "";
}

// A whole quantity of 0 or more ("" = 0), undefined when not sent, or
// null when it isn't a valid quantity.
function toQty(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return 0;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_QTY ? n : null;
}

// PATCH /api/stock-opname/summary/reconciliation
// body: { opnameNumber, itemId, plus?, minus? }
//
// The Stock Opname Summary report's Reconciliation columns for one SKU's
// per-SKU (SOSKU-) opname: a quantity added to (+) and taken off (−) the
// counted Total SO, giving the Final SO (Total SO + plus − minus). Leave
// one out to keep it as it is. Changes no stock.
//
// Returns { reconciliation: { plus, minus, at, by } | null } (null = both 0).
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const opnameNumber = sanitize(body.opnameNumber);
  const itemId = Number(body.itemId);
  if (!opnameNumber || !isSkuOpname(opnameNumber) || !Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "opnameNumber (SOSKU-) and itemId are required" }, { status: 400 });
  }
  const plus = toQty(body.plus);
  const minus = toQty(body.minus);
  if (plus === null || minus === null) {
    return NextResponse.json({ error: "Enter a whole number of 0 or more" }, { status: 400 });
  }
  if (plus === undefined && minus === undefined) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const [row] = await db
    .select({ id: stockOpnameSkus.id, plus: stockOpnameSkus.reconcilePlus, minus: stockOpnameSkus.reconcileMinus })
    .from(stockOpnameSkus)
    .where(and(eq(stockOpnameSkus.opnameNumber, opnameNumber), eq(stockOpnameSkus.itemId, itemId)));
  if (!row) {
    return NextResponse.json({ error: "This SKU isn't in that opname session" }, { status: 404 });
  }

  const next = { plus: plus ?? row.plus, minus: minus ?? row.minus };
  if (next.plus === 0 && next.minus === 0) {
    await db
      .update(stockOpnameSkus)
      .set({ reconcilePlus: 0, reconcileMinus: 0, reconciledAt: null, reconciledBy: null })
      .where(eq(stockOpnameSkus.id, row.id));
    return NextResponse.json({ reconciliation: null });
  }

  const now = new Date();
  const [[user]] = await Promise.all([
    db.select({ username: users.username }).from(users).where(eq(users.id, session.userId)),
    db
      .update(stockOpnameSkus)
      .set({ reconcilePlus: next.plus, reconcileMinus: next.minus, reconciledAt: now, reconciledBy: session.userId })
      .where(eq(stockOpnameSkus.id, row.id)),
  ]);

  // Same display format as the summary (24-hour, Asia/Jakarta).
  const at = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return NextResponse.json({ reconciliation: { ...next, at, by: user?.username ?? null } });
}
