// How a sales order is shown on the PDA (and anywhere else that wants it):
// "<document type> - <document number>", e.g. "SO - 202610000658" for the
// stored SO number "SO-202610000658", or "HPT - 202610000506" for
// "HPT202610000506". Safe to import from client code.
//
// The number part drops the type's own start so it isn't shown twice:
// the type's number prefix ("SO-") if the SO number starts with it,
// otherwise the type name if the number starts with it followed by a
// non-letter ("HPT2026…", "MDE 0001", "hpt/0004"). Then any leading
// dashes / slashes / spaces go. Orders with no type are shown as their
// plain SO number.

export type SoTypeForDisplay = { name: string; numberPrefix: string | null };

// Non-breaking and zero-width spaces sneak in from pasted paperwork.
const INVISIBLE = /[ ​‌‍﻿]/g;

function stripStart(value: string, start: string): string | null {
  return start && value.toLowerCase().startsWith(start.toLowerCase()) ? value.slice(start.length) : null;
}

export function formatSoDisplay(soNumber: string, type: SoTypeForDisplay | null | undefined): string {
  if (!type) return soNumber;

  const clean = soNumber.replace(INVISIBLE, " ").trim();
  const afterName = stripStart(clean, type.name);
  const rest =
    stripStart(clean, (type.numberPrefix ?? "").trim()) ??
    // The name only counts as a whole word: "SO" must not eat "SOX…".
    (afterName !== null && !/^[A-Za-z]/.test(afterName) ? afterName : null) ??
    clean;

  const number = rest.replace(/^[\s\-/]+/, "") || clean;
  return `${type.name} - ${number}`;
}
