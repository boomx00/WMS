"use client";

import { DEFAULT_LABELS, PageKey } from "@/lib/pageLabels";
import { useLanguage } from "@/lib/LanguageContext";

export function usePageLabels<P extends PageKey>(page: P): Record<string, string> {
  // Overrides come from the root layout (server), so labels are correct on
  // the very first render — no fetch, no flash of default text.
  const { language, overrides } = useLanguage();
  const raw = overrides[page];

  const defaults: Record<string, string> = DEFAULT_LABELS[page];
  const resolved: Record<string, string> = {};

  for (const key of Object.keys(defaults)) {
    const entry = raw?.[key];
    // Chosen language -> English override -> compiled-in default,
    // in that order, so a missing translation never renders blank.
    resolved[key] = (entry?.[language] || entry?.en || defaults[key]) as string;
  }

  return resolved;
}