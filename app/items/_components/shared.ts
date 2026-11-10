import type { Category, Options, Supplier, Unit } from "./types";

// Constants and small helpers shared by the Items page components.

export const KIND_LABEL: Record<Supplier["kind"], string> = { PRODUCTION: "Production", EXTERNAL: "External" };

export const TYPE_LIST = "items-type-options";

export const BRAND_LIST = "items-brand-options";

export const ALL = "";

export const NONE = "\u0000none";

 // filter value: products with no Type / Brand

export const inputClass =
  "w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500";

export const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

// A category's units, looked up from the options.
export type CategoryUnits = {
  category: Category;
  primary: Unit | null;
  secondary: Unit | null;
  storage: Unit | null;
};

export function categoryUnits(options: Options, categoryId: number | null): CategoryUnits | null {
  if (categoryId === null) return null;
  const category = options.categories.find((c) => c.id === categoryId);
  if (!category) return null;
  const unit = (id: number | null) => (id === null ? null : options.units.find((u) => u.id === id) ?? null);
  return {
    category,
    primary: unit(category.primaryUnitId),
    secondary: unit(category.secondaryUnitId),
    storage: unit(category.storageUnitId),
  };
}

// "Pack / Carton" — what a category's ratio counts.
export function ratioCaption(cu: CategoryUnits | null): string {
  if (!cu || !cu.secondary || !cu.primary) return "Ratio";
  return `${cu.secondary.name} / ${cu.primary.name}`;
}

// "Carton / Pallet" — what a category's storage qty counts.
export function storageCaption(cu: CategoryUnits | null): string {
  if (!cu || !cu.storage || !cu.primary) return "Per storage unit";
  return `${cu.primary.name} / ${cu.storage.name}`;
}

// "Carton / Pack / Pallet" — a category's units in one line.
export function unitsSummary(cu: CategoryUnits | null): string {
  if (!cu) return "";
  return [cu.primary?.name, cu.secondary?.name, cu.storage?.name].filter(Boolean).join(" / ");
}
