// Stock opname lines at packs locations ("Counted in loose packs" types)
// count loose packs: stock_opname_items keeps them in system_packs /
// counted_packs / difference_packs with counts_in_packs set, and leaves the
// carton columns at 0 (db/schema/stockOpname.ts). The opname APIs hand a
// line out in its own unit, with `unit` saying which.

export type OpnameUnit = "CARTON" | "PACKS";

type LineRow = {
  countsInPacks: boolean;
  systemQty: number;
  countedQty: number | null;
  difference: number | null;
  systemPacks: number;
  countedPacks: number | null;
  differencePacks: number;
};

// A line's system / counted / difference in its own unit.
export function lineInUnit(row: LineRow): {
  unit: OpnameUnit;
  systemQty: number;
  countedQty: number | null;
  difference: number | null;
} {
  if (row.countsInPacks) {
    return {
      unit: "PACKS",
      systemQty: row.systemPacks,
      countedQty: row.countedPacks,
      difference: row.differencePacks,
    };
  }
  return { unit: "CARTON", systemQty: row.systemQty, countedQty: row.countedQty, difference: row.difference };
}
