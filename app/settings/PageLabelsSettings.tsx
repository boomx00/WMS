"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LABELS, PAGE_OPTIONS, PageKey } from "@/lib/pageLabels";

export default function PageLabelsSettings() {
  const [page, setPage] = useState<PageKey>(PAGE_OPTIONS[0].key);
  const [values, setValues] = useState<Record<string, string>>(DEFAULT_LABELS[page]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setMessage(null);
    setError(null);
    fetch(`/api/settings/labels?page=${page}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setValues(data))
      .catch(() => setError("Failed to load labels"))
      .finally(() => setLoading(false));
  }, [page]);

  function updateField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    setError(null);

    const res = await fetch("/api/settings/labels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, labels: values }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save labels");
      return;
    }

    setMessage("Saved.");
  }

  async function handleResetField(key: string) {
    const res = await fetch("/api/settings/labels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, key }),
    });
    if (res.ok) {
      updateField(key, DEFAULT_LABELS[page][key as keyof (typeof DEFAULT_LABELS)[typeof page]]);
    }
  }

  const defaults = DEFAULT_LABELS[page];

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">Page Labels</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Customize the text shown on specific pages — e.g. column headers. Changes apply immediately for
        everyone using that page.
      </p>

      <div className="mb-4">
        <label className="block text-xs text-zinc-500 mb-1">Page</label>
        <select
          value={page}
          onChange={(e) => setPage(e.target.value as PageKey)}
          className="px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        >
          {PAGE_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-600">Loading...</p>
      ) : (
        <div className="space-y-3 mb-4">
          {Object.entries(defaults).map(([key, defaultValue]) => {
            const current = values[key] ?? defaultValue;
            const isCustomized = current !== defaultValue;
            return (
              <div key={key} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] text-zinc-500 mb-1">
                    {key}
                    {isCustomized && <span className="text-amber-500"> · customized</span>}
                  </label>
                  <input
                    type="text"
                    value={current}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={defaultValue}
                    className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                {isCustomized && (
                  <button
                    onClick={() => handleResetField(key)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 pb-2"
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save Labels"}
      </button>

      {message && <p className="text-xs text-emerald-400 mt-2">{message}</p>}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}