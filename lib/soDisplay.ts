// How a sales order is shown on the PDA (soDisplay): its document number
// written with the type's SO Number Prefix exactly as set on Sales Orders →
// Sales Order Types, e.g. "SO-202610000658" (prefix "SO-") or
// "HPT202610000506" (prefix "HPT"). Safe to import from client code.
//
// The number part is what's left after the type's own start — its prefix
// ("SO-"), or its name followed by a non-letter ("hpt-0001", "MDE 0001") —
// minus any leading dashes / slashes / spaces. So older or hand-typed
// numbers come out in the same format as new ones:
//   "hpt-202610000001" with prefix "HPT"  → "HPT202610000001"
//   "MDE 202610000002" with prefix "MDE-" → "MDE-202610000002"
//   "202610000005"     with prefix "SO-"  → "SO-202610000005"
// A type with no prefix shows the stored number (with the type name in
// front if the number doesn't already start with it). Orders with no type
// are shown as their plain SO number.

export type SoTypeForDisplay = { name: string; numberPrefix: string | null };

// Non-breaking and zero-width spaces sneak in from pasted paperwork.
const INVISIBLE = /[\u00A0\u200B\u200C\u200D\uFEFF]/g;

function stripStart(value: string, start: string): string | null {
  return start && value.toLowerCase().startsWith(start.toLowerCase()) ? value.slice(start.length) : null;
}

export function formatSoDisplay(soNumber: string, type: SoTypeForDisplay | null | undefined): string {
  if (!type) return soNumber;

  const clean = soNumber.replace(INVISIBLE, " ").trim();
  // Kept as set on the web (a trailing space can be part of the format);
  // compared without surrounding spaces.
  const prefix = type.numberPrefix && type.numberPrefix.trim() ? type.numberPrefix : null;

  const afterPrefix = prefix ? stripStart(clean, prefix.trim()) : null;
  const afterName = stripStart(clean, type.name);
  // The name only counts as a whole word: "SO" must not eat "SOX…".
  const rest = afterPrefix ?? (afterName !== null && !/^[A-Za-z]/.test(afterName) ? afterName : null);

  if (!prefix) {
    return rest !== null ? clean : `${type.name} ${clean}`;
  }

  // Doesn't start with the type at all (e.g. a bare "202610000005"): the
  // whole stored number is the number part.
  const number = (rest ?? clean).replace(/^[\s\-/]+/, "");
  if (!number) return clean;
  return `${prefix}${number}`;
}