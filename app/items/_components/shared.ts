import type { Supplier } from "./types";

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
