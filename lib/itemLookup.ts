// Server-only: turn a code scanned or typed on the PDA into a product.
//
// What the code is matched against is set in Settings → PDA ("Product code
// accepts"): any of
//   SKU         items.sku
//   LEGACY_SKU  items.legacy_sku
//   BARCODE     items.carton_barcode and items.extra_barcodes
// A pallet label (*SKU*seq*qty*WO) is matched by its SKU segment, so it
// counts as a SKU / legacy SKU, never as a barcode.
//
// Barcodes aren't unique — variants can share one. When a code matches
// several products, the one the screen expects (expectedSku) wins; with no
// expected product the lookup is ambiguous and the PDA shows the choices.

import { items } from "@/db/schema";
import { eq, or, sql, type SQL } from "drizzle-orm";
import { getPdaRules, type ItemLookupField } from "@/lib/pdaRules";

type Item = typeof items.$inferSelect;

export type ItemLookupResult =
  | { ok: true; item: Item }
  | { ok: false; status: 400 | 404 | 409; error: string; candidates?: Item[] };

export function sanitizeCode(input: string): string {
  return input.replace(/\0/g, "").trim();
}

// The SKU segment of a pallet label, or null when the code isn't a label.
export function labelSkuSegment(code: string): string | null {
  if (!code.includes("*")) return null;
  const cleaned = code.replace(/^\*+/, "");
  return cleaned.split("*")[0]?.trim() || null;
}

const FIELD_NAMES: Record<ItemLookupField, string> = {
  SKU: "SKU",
  LEGACY_SKU: "legacy SKU",
  BARCODE: "barcode",
};

export function describeLookupFields(fields: ItemLookupField[]): string {
  return fields.map((f) => FIELD_NAMES[f]).join(" / ");
}

// options.fields: override the setting (e.g. an exact-SKU lookup the screen
// makes itself, not something a worker typed).
export async function resolveItemCode(
  db: any,
  rawCode: string,
  options: { expectedSku?: string | null; fields?: ItemLookupField[] } = {}
): Promise<ItemLookupResult> {
  const code = sanitizeCode(rawCode);
  if (!code) return { ok: false, status: 400, error: "A product code is required" };

  const fields = options.fields ?? (await getPdaRules(db)).itemLookupFields;
  const labelSku = labelSkuSegment(code);

  const conditions: SQL[] = [];
  if (labelSku !== null) {
    if (fields.includes("SKU")) conditions.push(eq(items.sku, labelSku));
    if (fields.includes("LEGACY_SKU")) conditions.push(eq(items.legacySku, labelSku));
  } else {
    if (fields.includes("SKU")) conditions.push(eq(items.sku, code));
    if (fields.includes("LEGACY_SKU")) conditions.push(eq(items.legacySku, code));
    if (fields.includes("BARCODE")) {
      conditions.push(eq(items.cartonBarcode, code));
      conditions.push(sql`${code} = any(${items.extraBarcodes})`);
    }
  }

  const accepted = describeLookupFields(fields);
  if (conditions.length === 0) {
    return {
      ok: false,
      status: 404,
      error: `Label palet tidak diterima — kode produk hanya bisa ${accepted} (Settings → PDA)`,
    };
  }

  const matches: Item[] = await db
    .select()
    .from(items)
    .where(or(...conditions))
    .orderBy(items.sku)
    .limit(20);

  if (matches.length === 0) {
    return { ok: false, status: 404, error: `"${code}" tidak ditemukan sebagai ${accepted}` };
  }
  if (matches.length === 1) return { ok: true, item: matches[0] };

  // Several products: an exact current-SKU match is never ambiguous, then
  // the product this screen expects.
  const exactSku = matches.find((m) => m.sku === (labelSku ?? code));
  if (exactSku) return { ok: true, item: exactSku };
  const expected = options.expectedSku ? matches.find((m) => m.sku === options.expectedSku) : undefined;
  if (expected) return { ok: true, item: expected };

  return {
    ok: false,
    status: 409,
    error: `"${code}" cocok dengan beberapa produk: ${matches.map((m) => m.sku).join(", ")} — ketik SKU-nya`,
    candidates: matches,
  };
}

// Barcodes from an array or a "a, b c" / one-per-line string: trimmed,
// empties and duplicates dropped, at most 50.
export function cleanBarcodes(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const b = sanitizeCode(v).slice(0, 100);
    if (b && !out.includes(b)) out.push(b);
    if (out.length >= 50) break;
  }
  return out;
}
