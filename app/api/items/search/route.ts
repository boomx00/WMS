import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { ilike, or, sql } from "drizzle-orm";

const MAX_RESULTS = 15;

function sanitize(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// GET /api/items/search?q=XL38
//
// Used by manual-entry SKU fields (e.g. the Stock Opname count dialog) to
// resolve a product name as the person types, and to offer a pick list
// when the typed value isn't an exact SKU yet.
//
// Matches on:
//   - SKU, contains match (case-insensitive)
//   - Product name, contains match with ALL WHITESPACE STRIPPED from both
//     sides before comparing — so typing "XL38" also finds names written
//     as "XL 38" (space before the size) or "XL38+4" (suffix attached),
//     not just an exact "XL38" substring.
export async function GET(req: NextRequest) {
  const q = sanitize(req.nextUrl.searchParams.get("q") ?? "");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const skuPattern = `%${q}%`;
  const namePattern = `%${q.replace(/\s+/g, "")}%`;

  const rows = await db
    .select({
      sku: items.sku,
      name: items.name,
      palletCartonQty: items.palletCartonQty,
    })
    .from(items)
    .where(
      or(
        ilike(items.sku, skuPattern),
        sql`regexp_replace(${items.name}, '\s+', '', 'g') ILIKE ${namePattern}`
      )
    )
    .orderBy(items.name)
    .limit(MAX_RESULTS);

  return NextResponse.json(rows);
}