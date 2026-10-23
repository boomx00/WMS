export type Language = "en" | "id" | "zh";

export type RawLabel = { en: string; id: string; zh: string };

// page -> key -> { en, id, zh } overrides from the page_labels table.
export type LabelOverrides = Record<string, Record<string, RawLabel>>;

export const LANGUAGE_COOKIE = "wms_language";

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "id" || value === "zh";
}