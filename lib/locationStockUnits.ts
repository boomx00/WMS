// Location Stock: each row's units (from its product's category) and its
// quantity in any unit the product has. Pure — no server imports, so the
// page, the search route and the table all use it.
//
// A row holds `quantity` in the product's primary unit (e.g. Carton) and,
// at "Counted in packs" locations, `loosePacks` in its secondary unit
// (e.g. Pack). Converting:
//   primary   = quantity + loosePacks ÷ ratio            (30 ctn + 4 pk at 8 → 30.5)
//   secondary = quantity × ratio + loosePacks             (→ 244 pk)
//   storage   = primary ÷ storage qty                     (→ 30.5 ÷ 14 pallets)
// A unit the product doesn't have → null (left out of that total).

import { unitName, type UnitInfo } from "@/lib/uom";
import type { Language } from "@/lib/language";

export type RowUnits = {
  primaryUnitId: number | null; // null: product has no category yet
  primaryCode: string | null;
  secondaryUnitId: number | null;
  secondaryCode: string | null;
  storageUnitId: number | null;
  storageCode: string | null;
  ratio: number; // secondary per primary (items.carton_bag_qty)
  storageQty: number; // primary per storage unit (items.pallet_carton_qty)
};

export type RowQty = RowUnits & { quantity: number; loosePacks: number };

// Units a total can be shown in (Settings → Location Stock totals).
export type TotalUnit = Pick<UnitInfo, "id" | "code" | "name" | "nameId" | "nameZh" | "decimals">;

export function rowQtyIn(row: RowQty, unitId: number): number | null {
  const ratio = row.secondaryUnitId !== null ? Math.max(1, row.ratio || 1) : 1;
  const loose = row.secondaryUnitId !== null ? row.loosePacks || 0 : 0;
  const primary = row.quantity + loose / ratio;
  if (unitId === row.primaryUnitId) return primary;
  if (unitId === row.secondaryUnitId) return row.quantity * ratio + loose;
  if (unitId === row.storageUnitId) return primary / Math.max(1, row.storageQty || 1);
  return null;
}

// Totals of the rows in each unit, in order, with how many rows were
// counted. Units no row has are left out. Automatic (units = null): each
// product's own primary unit, in the units' display order.
export function totalsByUnit(
  rows: RowQty[],
  units: TotalUnit[] | null,
  allUnits: TotalUnit[]
): { unit: TotalUnit; total: number; skus: number }[] {
  if (units === null) {
    const byId = new Map<number, { total: number; skus: number }>();
    for (const r of rows) {
      if (r.primaryUnitId === null) continue;
      const entry = byId.get(r.primaryUnitId) ?? { total: 0, skus: 0 };
      entry.total += rowQtyIn(r, r.primaryUnitId) ?? 0;
      entry.skus++;
      byId.set(r.primaryUnitId, entry);
    }
    return allUnits.filter((u) => byId.has(u.id)).map((u) => ({ unit: u, ...byId.get(u.id)! }));
  }
  return units
    .map((unit) => {
      let total = 0;
      let counted = 0;
      for (const r of rows) {
        const v = rowQtyIn(r, unit.id);
        if (v === null) continue;
        total += v;
        counted++;
      }
      return { unit, total, skus: counted };
    })
    .filter((t) => t.skus > 0);
}

// 1,234 / 30.5 / 0.071 — at most 3 decimals, trailing zeros dropped.
export function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function totalUnitName(unit: TotalUnit, language: Language): string {
  return unitName(unit, language);
}

// A group's stock by unit code: "1,200 CTN + 40 PK · 12.5 KG".
export function groupTotalLabel(rows: RowQty[]): string {
  const order: string[] = [];
  const byCode = new Map<string, { primary: number; loose: number; looseCode: string | null }>();
  for (const r of rows) {
    const code = r.primaryCode ?? "";
    let entry = byCode.get(code);
    if (!entry) {
      entry = { primary: 0, loose: 0, looseCode: r.secondaryCode };
      byCode.set(code, entry);
      order.push(code);
    }
    entry.primary += r.quantity;
    entry.loose += r.loosePacks || 0;
  }
  return order
    .map((code) => {
      const e = byCode.get(code)!;
      const looseText = e.loose !== 0 ? `${formatQty(e.loose)} ${e.looseCode ?? ""}`.trim() : "";
      if (e.primary === 0 && looseText) return looseText;
      const main = `${formatQty(e.primary)} ${code}`.trim();
      return looseText ? `${main} + ${looseText}` : main;
    })
    .join(" · ");
}
