"use client";

import { useState } from "react";
import type { ItemOption } from "./types";

export default function ItemPicker({
  allItems,
  value,
  onChange,
}: {
  allItems: ItemOption[];
  value: string;
  onChange: (sku: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = allItems.find((item) => item.sku === value);

  const filtered = query.trim()
    ? allItems.filter(
        (item) =>
          item.sku.toLowerCase().includes(query.toLowerCase()) ||
          item.name.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={open ? query : selected ? `${selected.sku} — ${selected.name}` : ""}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Type SKU or name..."
        className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
      />

      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto border border-zinc-800 rounded-md bg-zinc-900 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-600">No matches</div>
          ) : (
            filtered.slice(0, 50).map((item) => (
              <button
                key={item.sku}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.sku);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors"
              >
                <span className="font-mono text-amber-500">{item.sku}</span>{" "}
                <span className="text-zinc-400">{item.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}