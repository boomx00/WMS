"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LABELS, PageKey } from "@/lib/pageLabels";
import { useLanguage } from "@/lib/LanguageContext";

type RawLabel = { en: string; id: string; zh: string };

export function usePageLabels<P extends PageKey>(page: P): Record<string, string> {
  const { language } = useLanguage();
  const [raw, setRaw] = useState<Record<string, RawLabel> | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/settings/labels?page=${page}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setRaw(data);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  const defaults: Record<string, string> = DEFAULT_LABELS[page];
  const resolved: Record<string, string> = {};

  for (const key of Object.keys(defaults)) {
    const entry = raw?.[key];
    // Chosen language -> English override/default -> compiled-in default,
    // in that order, so a missing translation never renders blank.
    resolved[key] = (entry?.[language] || entry?.en || defaults[key]) as string;
  }

  return resolved;
}