import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { ilike, or, sql } from "drizzle-orm";

const MAX_RESULTS = 20;

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
//
// A size/variant code like "M30" is often shared across many different
// MAKUKU product lines, so a plain alphabetical-by-name order can easily
// push the item the person actually wants past the result limit. To avoid
// that, results are ranked by how early the query match falls within the
// SKU or the whitespace-stripped name (earlier = more likely to be what
// they meant), with alphabetical order only as a tiebreaker.
export async function GET(req: NextRequest) {
  const q = sanitize(req.nextUrl.searchParams.get("q") ?? "");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const skuPattern = `%${q}%`;
  const normalizedQuery = q.replace(/\s+/g, "").toLowerCase();
  const namePattern = `%${normalizedQuery}%`;

  const skuMatchPosition = sql`COALESCE(NULLIF(POSITION(LOWER(${q}) IN LOWER(${items.sku})), 0), 999999)`;
  const nameMatchPosition = sql`COALESCE(NULLIF(POSITION(${normalizedQuery} IN LOWER(regexp_replace(${items.name}, '\s+', '', 'g'))), 0), 999999)`;
  const rank = sql`LEAST(${skuMatchPosition}, ${nameMatchPosition})`;

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
    .orderBy(rank, items.name)
    .limit(MAX_RESULTS);

  return NextResponse.json(rows);
}