import type {
  CombineResponse,
  CountedBy,
  CountLine,
  LocationStatus,
  ReportLocation,
  ReportRow,
  SessionChoice,
  Selections,
  SkuSummaryRow,
  SystemLine,
} from "./types";

// Pure calculations on the Combine CSO response, with the session picks applied.

export const LOCATION_STATUS_LABELS: Record<LocationStatus, string> = {
  MATCH: "Match",
  QTY_MISMATCH: "Qty Mismatch",
  SKU_MISMATCH: "SKU Mismatch",
  UNDER_REVIEW: "Under Review",
  NOT_OPNAMED: "Not Opnamed",
};

export const whoLabel = (b: CountedBy) => `${b.countedBy ?? "—"} (${b.opnameNumber})`;

const byCode = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

type SoSide = NonNullable<ReportRow["so"]>;

function compare(system: SystemLine | null, so: SoSide | null): LocationStatus {
  if ((system?.itemId ?? null) === (so?.itemId ?? null)) {
    return (system?.qty ?? 0) === (so?.qty ?? 0) ? "MATCH" : "QTY_MISMATCH";
  }
  // A SKU counted as 0 where the system has nothing: both say it's empty.
  if (!system && (so?.qty ?? 0) === 0) return "MATCH";
  return "SKU_MISMATCH";
}

// Each session's lines at a location. A session with no SKU lines confirmed it
// empty; its empty line is dropped if it also counted a SKU there.
function sessionsAt(location: ReportLocation) {
  const sessions = new Map<string, CountedBy & { lines: CountLine[] }>();
  for (const count of location.counts) {
    let session = sessions.get(count.opnameNumber);
    if (!session) {
      session = { opnameNumber: count.opnameNumber, countedBy: count.countedBy, lines: [] };
      sessions.set(count.opnameNumber, session);
    }
    if (!session.countedBy) session.countedBy = count.countedBy;
    if (count.itemId !== null) session.lines.push(count);
  }
  return [...sessions.values()].sort((a, b) => byCode(a.opnameNumber, b.opnameNumber));
}

const soOf = (line: CountLine): SoSide => ({ itemId: line.itemId!, sku: line.sku!, name: line.name!, qty: line.qty });

// A single-SKU location (rack): the choice is the whole location, because two
// sessions finding different SKUs there can't both be right.
function singleSkuRows(location: ReportLocation, selections: Selections): ReportRow[] {
  const base = { locationCode: location.locationCode, column: location.column };
  const sessions = sessionsAt(location);
  const resultOf = (lines: CountLine[]) => lines.map((l) => `${l.itemId}:${l.qty}`).sort().join("|");

  let used = sessions;
  let choice: SessionChoice | null = null;
  if (new Set(sessions.map((s) => resultOf(s.lines))).size > 1) {
    choice = {
      key: `loc:${location.locationCode}`,
      options: sessions.map((s) => ({
        opnameNumber: s.opnameNumber,
        countedBy: s.countedBy,
        detail: s.lines.length > 0 ? s.lines.map((l) => `${l.sku}: ${l.qty.toLocaleString()}`).join(", ") : "Empty",
      })),
    };
    const picked = sessions.find((s) => s.opnameNumber === selections[choice!.key]);
    if (!picked) {
      const reviewItemIds = [
        ...new Set([
          ...location.system.map((s) => s.itemId),
          ...sessions.flatMap((s) => s.lines.map((l) => l.itemId as number)),
        ]),
      ];
      const systemLines = location.system.length > 0 ? location.system : [null];
      return systemLines.map((system, i) => ({
        ...base,
        key: `${location.locationCode}-${system?.itemId ?? "none"}-review`,
        emptyConfirmed: false,
        system,
        so: null,
        by: [],
        choice: i === 0 ? choice : null,
        status: "UNDER_REVIEW",
        reviewItemIds,
      }));
    }
    used = [picked];
  }

  const lines = used[0].lines;
  const by = used.map(({ opnameNumber, countedBy }) => ({ opnameNumber, countedBy }));
  const systemLeft = location.system.filter((s) => !lines.some((l) => l.itemId === s.itemId));
  const soLeft = lines.filter((l) => !location.system.some((s) => s.itemId === l.itemId));
  const pairs: [SystemLine | null, CountLine | null][] = location.system
    .filter((s) => lines.some((l) => l.itemId === s.itemId))
    .map((s) => [s, lines.find((l) => l.itemId === s.itemId)!]);
  for (let i = 0; i < Math.max(systemLeft.length, soLeft.length); i++) {
    pairs.push([systemLeft[i] ?? null, soLeft[i] ?? null]);
  }
  if (pairs.length === 0) pairs.push([null, null]);

  return pairs.map(([system, line], i) => {
    const so = line ? soOf(line) : null;
    return {
      ...base,
      key: `${location.locationCode}-${system?.itemId ?? "none"}-${so?.itemId ?? "none"}`,
      emptyConfirmed: lines.length === 0,
      system,
      so,
      by,
      choice: i === 0 ? choice : null,
      status: compare(system, so),
      reviewItemIds: [],
    };
  });
}

// A mixed-SKU location (floor): several people can each count different SKUs
// on the same floor and all of it counts, so the choice is per SKU, only where
// sessions got different quantities for it. A session that confirmed the
// location empty disagrees with one that counted stock there: a count of 0.
function mixedSkuRows(location: ReportLocation, selections: Selections): ReportRow[] {
  const base = { locationCode: location.locationCode, column: location.column };
  const sessions = sessionsAt(location);
  const emptyVoters = sessions.filter((s) => s.lines.length === 0);
  const allLines = sessions.flatMap((s) => s.lines);
  const itemIds = [...new Set(allLines.map((l) => l.itemId as number))];
  const emptyConfirmed = allLines.length === 0;

  const soLines = itemIds.map((itemId) => {
    const first = allLines.find((l) => l.itemId === itemId)!;
    const votes = [
      ...sessions.flatMap((s) =>
        s.lines
          .filter((l) => l.itemId === itemId)
          .map((l) => ({ opnameNumber: s.opnameNumber, countedBy: s.countedBy, qty: l.qty }))
      ),
      ...emptyVoters.map((s) => ({ opnameNumber: s.opnameNumber, countedBy: s.countedBy, qty: 0 })),
    ].sort((a, b) => byCode(a.opnameNumber, b.opnameNumber));

    if (new Set(votes.map((v) => v.qty)).size === 1) {
      return {
        so: { ...soOf(first), qty: votes[0].qty },
        by: votes.map(({ opnameNumber, countedBy }) => ({ opnameNumber, countedBy })),
        choice: null,
      };
    }
    const choice: SessionChoice = {
      key: `${itemId}-${location.locationCode}`,
      options: votes.map((v) => ({
        opnameNumber: v.opnameNumber,
        countedBy: v.countedBy,
        detail: v.qty.toLocaleString(),
      })),
    };
    const picked = votes.find((v) => v.opnameNumber === selections[choice.key]);
    return {
      so: { ...soOf(first), qty: picked?.qty ?? null },
      by: picked ? [{ opnameNumber: picked.opnameNumber, countedBy: picked.countedBy }] : [],
      choice,
    };
  });

  const rowFor = (system: SystemLine | null, line: (typeof soLines)[number] | null): ReportRow => {
    const unresolved = line?.so.qty === null;
    return {
      ...base,
      key: `${location.locationCode}-${system?.itemId ?? "none"}-${line?.so.itemId ?? "none"}`,
      emptyConfirmed,
      system,
      so: line?.so ?? null,
      by: line?.by ?? (emptyConfirmed ? sessions.map(({ opnameNumber, countedBy }) => ({ opnameNumber, countedBy })) : []),
      choice: line?.choice ?? null,
      status: unresolved ? "UNDER_REVIEW" : compare(system, line?.so ?? null),
      reviewItemIds: unresolved ? [line!.so.itemId] : [],
    };
  };

  const rows = [
    ...location.system.map((s) => rowFor(s, soLines.find((l) => l.so.itemId === s.itemId) ?? null)),
    ...soLines.filter((l) => !location.system.some((s) => s.itemId === l.so.itemId)).map((l) => rowFor(null, l)),
  ];
  if (rows.length === 0) rows.push(rowFor(null, null));
  return rows.sort((a, b) => byCode(a.system?.sku ?? a.so?.sku ?? "", b.system?.sku ?? b.so?.sku ?? ""));
}

export function buildRows(result: CombineResponse, selections: Selections): ReportRow[] {
  return result.locations.flatMap((location) => {
    if (!location.opnamed) {
      const systemLines = location.system.length > 0 ? location.system : [null];
      return systemLines.map(
        (system): ReportRow => ({
          key: `${location.locationCode}-${system?.itemId ?? "none"}-none`,
          locationCode: location.locationCode,
          column: location.column,
          emptyConfirmed: false,
          system,
          so: null,
          by: [],
          choice: null,
          status: "NOT_OPNAMED",
          reviewItemIds: [],
        })
      );
    }
    return location.allowsMultipleSku ? mixedSkuRows(location, selections) : singleSkuRows(location, selections);
  });
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Every SKU's System / SO per column, with Total, Difference, Status and Δ K3
// counting only the ticked locations: under-review SKUs first, then the biggest
// differences.
export function summarizeSkus(result: CombineResponse, rows: ReportRow[], excludedColumns: string[]): SkuSummaryRow[] {
  const shownKeys = result.columns.map((c) => c.key).filter((k) => !excludedColumns.includes(k));
  const sumShown = (figures: Record<string, number>) => shownKeys.reduce((sum, k) => sum + (figures[k] ?? 0), 0);

  const soByItem = new Map<number, Record<string, number>>();
  const underReview = new Set<number>();
  for (const row of rows) {
    if (shownKeys.includes(row.column)) row.reviewItemIds.forEach((id) => underReview.add(id));
    if (row.so?.qty === null || !row.so) continue;
    if (!soByItem.has(row.so.itemId)) soByItem.set(row.so.itemId, {});
    const figures = soByItem.get(row.so.itemId)!;
    figures[row.column] = (figures[row.column] ?? 0) + (row.so.qty ?? 0);
  }

  return result.items
    .map((item): SkuSummaryRow => {
      const so = soByItem.get(item.itemId) ?? {};
      const totalSystem = sumShown(item.system);
      const totalSo = sumShown(so);
      const difference = totalSo - totalSystem;
      const k3 = result.k3 ? (item.k3Qty ?? 0) : null;
      return {
        itemId: item.itemId,
        sku: item.sku,
        name: item.name,
        system: item.system,
        so,
        totalSystem,
        totalSo,
        difference,
        status: underReview.has(item.itemId) ? "UNDER_REVIEW" : difference === 0 ? "MATCH" : "MISMATCH",
        k3,
        k3InFile: item.k3Qty !== null,
        k3Delta: k3 === null ? null : round3(totalSo - k3),
      };
    })
    .sort((a, b) => {
      const review = Number(b.status === "UNDER_REVIEW") - Number(a.status === "UNDER_REVIEW");
      return review || Math.abs(b.difference) - Math.abs(a.difference) || byCode(a.sku, b.sku);
    });
}

// Locations unticked on the SKU Summary, kept in this browser only (same as
// the Stock Opname Summary's column choice).
const EXCLUDED_KEY = "combineCso.excludedColumns";

export function readExcludedColumns(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(EXCLUDED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function writeExcludedColumns(keys: string[]) {
  try {
    window.localStorage.setItem(EXCLUDED_KEY, JSON.stringify(keys));
  } catch {
    // private window / storage blocked: the choice just isn't remembered
  }
}
