import type { Figures, Bucket, Cell, SummaryResponse, SortKey, Sort, DateSession } from "./types";

// Pure calculations on the summary data: figures per column, Final SO, K3 lookups, sessions per date, sorting.

export const EMPTY: Figures = { system: 0, counted: 0 };

export const figures = (cell: { buckets: Record<string, Figures> } | undefined, key: string): Figures =>
  cell?.buckets[key] ?? EMPTY;

// A bucket's figures as shown: for Total, the locked total (System) and all
// counted lines (SO), minus every column whose checkbox is unticked —
// untick Export and each date's Total System / SO drop by that date's
// Export System / SO. Other buckets are shown as they are.
export function shownFigures(
  cell: { buckets: Record<string, Figures> } | undefined,
  key: string,
  excludedKeys: string[]
): Figures {
  const f = figures(cell, key);
  if (key !== "total" || excludedKeys.length === 0) return f;
  let { system, counted } = f;
  for (const k of excludedKeys) {
    const x = figures(cell, k);
    system -= x.system;
    counted -= x.counted;
  }
  return { system, counted };
}

// The Final SO of one SOSKU line: the Total SO shown (unticked columns taken
// off) plus its Reconciliation + and minus its −. Δ K3 = Final SO − K3.
export function finalSoOf(cell: Cell, excludedKeys: string[]): number {
  const r = cell.reconciliation;
  return shownFigures(cell, "total", excludedKeys).counted + (r?.plus ?? 0) - (r?.minus ?? 0);
}

// The columns (not Total) that aren't in `selectedKeys`.
export const excludedFrom = (all: Bucket[], selectedKeys: string[]): string[] =>
  all.filter((b) => b.key !== "total" && !selectedKeys.includes(b.key)).map((b) => b.key);

export function nextSort(current: Sort, key: SortKey): Sort {
  const first = key === "stock" ? "desc" : "asc";
  if (!current || current.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

// Columns shown by default: those anything was counted in (Good Stock,
// Defect, ...); if nothing was counted yet, those with system stock.
export function defaultBucketKeys(data: SummaryResponse): string[] {
  const keys = data.buckets.filter((b) => b.key !== "total").map((b) => b.key);
  const any = (field: keyof Figures) =>
    keys.filter((k) => data.items.some((i) => Object.values(i.cells).flat().some((c) => figures(c, k)[field] !== 0)));
  const counted = any("counted");
  if (counted.length > 0) return counted;
  const system = any("system");
  return system.length > 0 ? system : keys.slice(0, 1);
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

// A product's K3 Good Stock for one SOSKU session: null when that session has
// no K3 import (no K3 figures are shown for it); inFile = false when the
// product wasn't in the session's K3 file (0 in K3).
export function k3Of(
  data: SummaryResponse,
  item: SummaryResponse["items"][number],
  opnameNumber: string
): { qty: number; inFile: boolean; importId: number } | null {
  const importId = data.k3Sessions?.[opnameNumber];
  if (importId === undefined) return null;
  const qty = item.k3?.[importId];
  return { qty: qty ?? 0, inFile: qty !== undefined, importId };
}

// Every SOSKU session of each date (from all products, not just the shown
// ones), ordered by session number.
export function sessionsByDate(data: SummaryResponse): Map<string, DateSession[]> {
  const out = new Map<string, Map<string, DateSession>>();
  for (const item of data.items) {
    for (const [date, list] of Object.entries(item.cells)) {
      const byNumber = out.get(date) ?? new Map<string, DateSession>();
      for (const c of list) {
        const s = byNumber.get(c.opnameNumber);
        if (!s) {
          byNumber.set(c.opnameNumber, {
            opnameNumber: c.opnameNumber,
            by: c.by,
            status: c.status,
            skus: 1,
            firstAt: c.lockedAt,
            lastAt: c.lockedAt,
          });
        } else {
          s.skus++;
          if (c.lockedAt < s.firstAt) s.firstAt = c.lockedAt;
          if (c.lockedAt > s.lastAt) s.lastAt = c.lockedAt;
          if (!s.by) s.by = c.by;
        }
      }
      out.set(date, byNumber);
    }
  }
  return new Map(
    [...out].map(([date, m]) => [
      date,
      [...m.values()].sort((a, b) => a.opnameNumber.localeCompare(b.opnameNumber, undefined, { numeric: true })),
    ])
  );
}
