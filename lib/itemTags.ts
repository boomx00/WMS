// Pure helpers for a product's Type / Brand / Tags — no server imports, so
// the Items page can use them too (lib/itemAttributes.ts has the queries).

const MAX_LENGTH = 100;
const MAX_TAGS = 50;

// Trimmed single value, or null when empty.
export function cleanAttribute(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\0/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
  return v || null;
}

// Tags from an array or a comma-separated string: trimmed, empties
// dropped, duplicates (ignoring case) dropped, first spelling kept.
export function cleanTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = cleanAttribute(t);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// Tags with sizes in size order, then the rest (pack combos etc.) naturally.
const SIZE_ORDER = ["NB", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
export function sortTags(tags: string[]): string[] {
  const rank = (t: string) => {
    const i = SIZE_ORDER.indexOf(t.toUpperCase());
    return i === -1 ? SIZE_ORDER.length : i;
  };
  return [...tags].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
}

// A supplier id from a request: a positive integer, null to clear it ("",
// null, 0), or undefined when it isn't being changed.
export function cleanSupplierId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === 0 || value === "0") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
