"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LegacySkuCell({
  itemId,
  initialValue,
}: {
  itemId: number;
  initialValue: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legacySku: value }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-28 px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-xs font-mono focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-xs text-amber-500 hover:underline"
        >
          {saving ? "..." : "Save"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="font-mono text-zinc-400 hover:text-amber-500 text-xs"
    >
      {initialValue || "— set —"}
    </button>
  );
}