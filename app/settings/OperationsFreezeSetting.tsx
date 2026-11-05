"use client";

import { useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { OPERATIONS_FREEZE_LABELS } from "@/lib/operationsFreezeLabels";

// Stops every stock change while on (enforced in proxy.ts). Takes effect on
// the next request, so unlike the other switches it asks first when turning on.
export default function OperationsFreezeSetting({ initial, readOnly }: { initial: boolean; readOnly: boolean }) {
  const labels = usePageLabels("settings_page", OPERATIONS_FREEZE_LABELS);
  const [frozen, setFrozen] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !frozen;
    if (next && !window.confirm(labels.operations_freeze_confirm)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationsFrozen: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? labels.operations_freeze_failed);
      setFrozen(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.operations_freeze_failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`border rounded-lg p-5 ${frozen ? "border-red-800 bg-red-950/30" : "border-zinc-800 bg-zinc-900/30"}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{labels.operations_freeze}</div>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm">{labels.operations_freeze_description}</p>
        </div>
        <button
          role="switch"
          aria-checked={frozen}
          aria-label={labels.operations_freeze}
          onClick={toggle}
          disabled={saving || readOnly}
          className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
            frozen ? "bg-red-500" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
              frozen ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {frozen && <p className="text-xs text-red-300 mt-3">{labels.operations_freeze_on}</p>}
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
    </div>
  );
}
