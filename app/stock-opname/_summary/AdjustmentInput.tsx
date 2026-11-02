"use client";

import { useState } from "react";
import { NOTE_MAX_LENGTH } from "./format";

// The Adj field of one SOSKU session: free text. Type and press Enter (or
// click away) to save; empty it to clear. Escape puts the saved value back.
// Green = saved, red = not saved (hover for the reason).
export function AdjustmentInput({
  value,
  title,
  ariaLabel,
  onSave,
  multiline = false,
  placeholder = "—",
}: {
  value: string;
  title: string;
  ariaLabel: string;
  onSave: (note: string) => Promise<{ error?: string }>;
  // The report's version: a wide box that wraps and grows with the text;
  // Enter saves, Shift+Enter adds a line.
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null = showing the saved value
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (draft === null) return;
    const note = draft.trim();
    if (note === value) {
      setDraft(null);
      return;
    }
    setSaving(true);
    const result = await onSave(note);
    setSaving(false);
    if (result.error) {
      setError(result.error); // keep the typed text so it can be saved again
      return;
    }
    setError(null);
    setDraft(null);
  }

  const tone = error
    ? "border-red-700 text-red-300"
    : value
      ? "border-emerald-900 text-emerald-400"
      : "border-zinc-800 text-zinc-200";

  const shared = {
    value: draft ?? value,
    onFocus: () => setDraft((d) => d ?? value),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      if (error) setError(null);
    },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !(multiline && e.shiftKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
      if (e.key === "Escape") {
        e.stopPropagation(); // undo the edit, don't close the report
        setDraft(null);
        setError(null);
        // Let the blur that follows see nothing to save.
        const el = e.currentTarget;
        requestAnimationFrame(() => el.blur());
      }
    },
    disabled: saving,
    placeholder,
    maxLength: NOTE_MAX_LENGTH,
    title: error ?? title,
    "aria-label": ariaLabel,
    "aria-invalid": error !== null,
  };

  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={1}
        className={`block w-full min-h-[2rem] resize-y [field-sizing:content] px-2 py-1 rounded bg-zinc-950 border text-xs leading-snug whitespace-pre-wrap break-words placeholder:text-zinc-700 focus:outline-none focus:border-amber-500 disabled:opacity-50 ${tone}`}
      />
    );
  }
  return (
    <input
      type="text"
      {...shared}
      className={`w-[4.75rem] px-1 py-0.5 rounded bg-zinc-950 border font-mono text-[9px] placeholder:text-zinc-700 focus:outline-none focus:border-amber-500 disabled:opacity-50 ${tone}`}
    />
  );
}
