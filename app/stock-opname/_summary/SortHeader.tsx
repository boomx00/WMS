"use client";

import type { SortKey, Sort } from "./types";

export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`hover:text-zinc-200 transition-colors ${active ? "text-amber-400" : ""} ${
        align === "right" ? "text-right" : "inline-flex items-center gap-0.5"
      }`}
    >
      {label}
      {align === "right" ? " " : null}
      <span className={active ? "" : "text-zinc-700"}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}
