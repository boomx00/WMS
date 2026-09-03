"use client";

import { useEffect, useState } from "react";
import { PAGE_OPTIONS, PageKey } from "@/lib/pageLabels";

type RawLabel = { en: string; id: string; zh: string };

export default function PageLabelsSettings() {
  const [page, setPage] = useState<PageKey>(PAGE_OPTIONS[0].key);
  const [values, setValues] = useState<Record<string, RawLabel>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    loadLabels();
  }, [page]);

  function loadLabels() {
    setLoading(true);
    setError(null);
    fetch(`/api/settings/labels?page=${page}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setValues(data))
      .catch(() => setError("Failed to load labels"))
      .finally(() => setLoading(false));
  }

  async function handleSaveTranslation(key: string, id: string, zh: string) {
    const res = await fetch("/api/settings/labels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page,
        // English is unchanged here — only Indonesian/Chinese are edited
        // via the popup — so it's sent through as-is to avoid clearing it.
        labels: { [key]: { en: values[key].en, id, zh } },
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to save translation");
    }

    setValues((prev) => ({ ...prev, [key]: { ...prev[key], id, zh } }));
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <h2 className="text-sm font-medium mb-1">Translations</h2>
      <p className="text-xs text-zinc-500 mb-4">
        Users pick their language from the selector in the navbar. Anything left blank in Indonesian or
        Chinese falls back to the Default Lang text.
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

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {loading ? (
        <p className="text-xs text-zinc-600">Loading...</p>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-500 text-left">
                <th className="px-3 py-2 font-medium">Default Lang</th>
                <th className="px-3 py-2 font-medium">Indonesian</th>
                <th className="px-3 py-2 font-medium">Chinese</th>
                <th className="px-3 py-2 font-medium">Functions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(values).map(([key, langs]) => (
                <tr key={key} className="border-t border-zinc-800/60">
                  <td className="px-3 py-2 text-zinc-200">{langs.en}</td>
                  <td className="px-3 py-2 text-zinc-400">{langs.id || <span className="text-zinc-700">—</span>}</td>
                  <td className="px-3 py-2 text-zinc-400">{langs.zh || <span className="text-zinc-700">—</span>}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setEditingKey(key)}
                      className="text-xs text-amber-500 hover:text-amber-400"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingKey && (
        <TranslationModal
          labelKey={editingKey}
          english={values[editingKey].en}
          initialId={values[editingKey].id}
          initialZh={values[editingKey].zh}
          onSave={handleSaveTranslation}
          onClose={() => setEditingKey(null)}
        />
      )}
    </div>
  );
}

function TranslationModal({
  labelKey,
  english,
  initialId,
  initialZh,
  onSave,
  onClose,
}: {
  labelKey: string;
  english: string;
  initialId: string;
  initialZh: string;
  onSave: (key: string, id: string, zh: string) => Promise<void>;
  onClose: () => void;
}) {
  const [idText, setIdText] = useState(initialId);
  const [zhText, setZhText] = useState(initialZh);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(labelKey, idText, zhText);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium mb-1">Edit Translation</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Default Lang: <span className="text-zinc-300">{english}</span>
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Indonesian</label>
            <input
              type="text"
              value={idText}
              onChange={(e) => setIdText(e.target.value)}
              placeholder={english}
              autoFocus
              className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Chinese</label>
            <input
              type="text"
              value={zhText}
              onChange={(e) => setZhText(e.target.value)}
              placeholder={english}
              className="w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-md border border-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}