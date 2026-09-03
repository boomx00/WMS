"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LABELS, PageKey } from "@/lib/pageLabels";

export function usePageLabels<P extends PageKey>(page: P): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>(DEFAULT_LABELS[page]);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/settings/labels?page=${page}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setLabels(data);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  return labels;
}