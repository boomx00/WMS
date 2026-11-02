"use client";

import { useState } from "react";
import { cleanTags, sortTags } from "@/lib/itemTags";

// Tags as chips (× removes one) plus a box to type more: Enter or comma adds
// what's typed; tags already in use are suggested while typing.
export function TagEditor({
  value,
  onChange,
  suggestions,
  placeholder = "Type a tag, Enter to add",
  autoFocus = false,
  onEnterEmpty,
  onEscape,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  autoFocus?: boolean;
  onEnterEmpty?: () => void;
  onEscape?: () => void;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const q = text.trim().toLowerCase();
  const matches = suggestions.filter((s) => !has(s) && (!q || s.toLowerCase().includes(q))).slice(0, 12);

  function add(raw: string) {
    const added = cleanTags(raw);
    if (added.length > 0) onChange(cleanTags([...value, ...added]));
    setText("");
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 focus-within:border-amber-600">
        {sortTags(value).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full bg-zinc-800 text-[11px] font-mono text-zinc-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="text-zinc-500 hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={text}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) add(text);
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
              else onEnterEmpty?.();
            } else if (e.key === "Escape") {
              onEscape?.();
            } else if (e.key === "Backspace" && !text && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[6rem] bg-transparent text-xs font-mono py-0.5 focus:outline-none"
        />
      </div>
      {focused && matches.length > 0 && (
        <div className="absolute z-20 mt-1 max-w-xs flex flex-wrap gap-1 p-1.5 rounded border border-zinc-700 bg-zinc-900 shadow-lg">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              // mousedown so it lands before the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(cleanTags([...value, s]));
                setText("");
              }}
              className="px-1.5 py-0.5 rounded-full border border-zinc-700 text-[11px] font-mono text-zinc-300 hover:border-amber-500 hover:text-amber-300"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
