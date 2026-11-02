// Browser-saved preferences: picked columns per warehouse, hidden products.

export const storageKey = (warehouseId: number) => `stockOpnameSummary.columns.${warehouseId}`;

export function readStored(warehouseId: number): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey(warehouseId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : null;
  } catch {
    return null;
  }
}

export function writeStored(warehouseId: number, keys: string[]) {
  try {
    window.localStorage.setItem(storageKey(warehouseId), JSON.stringify(keys));
  } catch {
    // private window / storage blocked — the choice just isn't remembered
  }
}

// Products hidden from the table with the row's hide button. Kept in this
// browser only (same as the column choice), for every warehouse.
export const HIDDEN_KEY = "stockOpnameSummary.hiddenItems";

export function readHidden(): number[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function writeHidden(ids: number[]) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    // private window / storage blocked — hiding just isn't remembered
  }
}
