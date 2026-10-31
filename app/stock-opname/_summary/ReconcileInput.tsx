"use client";

import { useState } from "react";
import type { Reconciliation } from "./types";

// A Reconciliation box's tooltip: who saved it and when, after its meaning.
export function reconcileTitle(r: Reconciliation | null | undefined, meaning: string): string {
  return r?.at ? `${meaning}\n${r.at}${r.by ? ` · ${r.by}` : ""}` : meaning;
}

// One Reconciliation box (+ or −) of a report line: a whole quantity of 0 or
// more. Enter or clicking away saves; Escape puts the saved value back;
// empty = 0. Red border = not saved (hover for the reason).
export function ReconcileInput({
  value,
  tone,
  title,
  ariaLabel,
  onSave,
  compact = false,
}: {
  value: number;
  tone: "plus" | "minus";
  // The summary table's version: small, to fit its narrow columns.
  compact?: boolean;
  title: string;
  ariaLabel: string;
  onSave: (qty: number) => Promise<{ error?: string }>;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null = showing the saved value
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (draft === null) return;
    const text = draft.trim();
    const qty = text === "" ? 0 : Number(text);
    if (!Number.isInteger(qty) || qty < 0) {
      setError("0, 1, 2, …");
      return;
    }
    if (qty === value) {
      setDraft(null);
      setError(null);
      return;
    }
    setSaving(true);
    const result = await onSave(qty);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setDraft(null);
  }

  const color = error
    ? "border-red-700 text-red-300"
    : value === 0
      ? "border-zinc-800 text-zinc-500"
      : tone === "plus"
        ? "border-emerald-900 text-emerald-400"
        : "border-red-900 text-red-400";

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft ?? (value === 0 ? "" : String(value))}
      placeholder="0"
      onFocus={() => setDraft((d) => d ?? (value === 0 ? "" : String(value)))}
      onChange={(e) => {
        setDraft(e.target.value.replace(/[^\d]/g, ""));
        if (error) setError(null);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.stopPropagation(); // undo the edit, don't close the report
          setDraft(null);
          setError(null);
          const el = e.currentTarget;
          requestAnimationFrame(() => el.blur());
        }
      }}
      disabled={saving}
      title={error ?? title}
      aria-label={ariaLabel}
      aria-invalid={error !== null}
      className={`${compact ? "w-10 px-1 text-[9px]" : "w-16 px-1.5 text-xs"} py-0.5 rounded bg-zinc-950 border text-right tabular-nums placeholder:text-zinc-700 focus:outline-none focus:border-amber-500 disabled:opacity-50 ${color}`}
    />
  );
}
