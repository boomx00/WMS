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
//   - Product name, contains match with whitespace stripped from both
//     sides before comparing — so typing "XL38" also finds names written
//     as "XL 38" (space before the size) or "XL38+4" (suffix attached),
//     not just an exact "XL38" substring.
//
// IMPORTANT: normalization does NOT use regexp \s to strip whitespace.
// Postgres's regex \s class only matches ASCII whitespace, but product
// names pasted in from Excel or scraped via the MES integration
// frequently carry a non-breaking space (U+00A0) or a tab where a normal
// space looks like it should be — those silently fail to match \s and
// the whole lookup comes back empty. Instead every whitespace-ish
// character we've actually seen in item names (regular space, non-
// breaking space, tab) is explicitly folded away with chained replace()
// calls, which don't depend on regex character-class/locale behavior.
export async function GET(req: NextRequest) {
  const q = sanitize(req.nextUrl.searchParams.get("q") ?? "");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const skuPattern = `%${q}%`;
  const normalizedQuery = q.replace(/[\s\u00a0]+/g, "").toLowerCase();
  const namePattern = `%${normalizedQuery}%`;

  // Normal space, then non-breaking space (chr 160), then tab (chr 9) —
  // all folded away, in that order so nested replace() calls compose.
  const normalizedName = sql`replace(replace(replace(${items.name}, chr(160), ''), chr(9), ''), ' ', '')`;

  // A size/variant code like "M30" is often shared across many different
  // MAKUKU product lines, so plain alphabetical-by-name order can easily
  // push the item the person actually wants past the result limit.
  // Rank by how early the match falls in the SKU or normalized name
  // (earlier = more likely to be what they meant), alphabetical as a
  // tiebreaker only.
  const skuMatchPosition = sql`COALESCE(NULLIF(POSITION(LOWER(${q}) IN LOWER(${items.sku})), 0), 999999)`;
  const nameMatchPosition = sql`COALESCE(NULLIF(POSITION(${normalizedQuery} IN LOWER(${normalizedName})), 0), 999999)`;
  const rank = sql`LEAST(${skuMatchPosition}, ${nameMatchPosition})`;

  const rows = await db
    .select({
      sku: items.sku,
      name: items.name,
      palletCartonQty: items.palletCartonQty,
    })
    .from(items)
    .where(or(ilike(items.sku, skuPattern), sql`LOWER(${normalizedName}) LIKE ${namePattern}`))
    .orderBy(rank, items.name)
    .limit(MAX_RESULTS);

  return NextResponse.json(rows);
}