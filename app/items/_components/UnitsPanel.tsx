"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Unit } from "./types";
import { inputClass } from "./shared";

type Draft = { code: string; name: string; nameId: string; nameZh: string; decimals: string };

const emptyDraft: Draft = { code: "", name: "", nameId: "", nameZh: "", decimals: "0" };

const toDraft = (u: Unit): Draft => ({
  code: u.code,
  name: u.name,
  nameId: u.nameId ?? "",
  nameZh: u.nameZh ?? "",
  decimals: String(u.decimals),
});

// Manager: units of measure (Carton, Pack, Kilogram, Pallet…) that product
// categories count and store their products in. Decimals = how many decimal
// places a quantity in the unit can have (0 for Carton, e.g. 3 for Kilogram);
// they're fixed once a category uses the unit.
export function UnitsPanel({ units }: { units: Unit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to save");
      return false;
    }
    router.refresh();
    return true;
  }

  const payload = (d: Draft) => ({
    code: d.code,
    name: d.name,
    nameId: d.nameId,
    nameZh: d.nameZh,
    decimals: Number(d.decimals),
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/units", "POST", payload(draft))) setDraft(emptyDraft);
  }

  async function saveEdit() {
    if (!editing) return;
    if (await call(`/api/units/${editing.id}`, "PATCH", payload(editing.draft))) setEditing(null);
  }

  const cell = "px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-sm focus:outline-none w-full";

  function field(d: Draft, set: (d: Draft) => void, key: keyof Draft, extra = "") {
    return (
      <input
        type={key === "decimals" ? "number" : "text"}
        min={key === "decimals" ? 0 : undefined}
        max={key === "decimals" ? 6 : undefined}
        value={d[key]}
        onChange={(e) => set({ ...d, [key]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveEdit();
          if (e.key === "Escape") setEditing(null);
        }}
        className={`${cell} ${extra}`}
      />
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left text-sm"
      >
        <span>
          Units of measure <span className="text-zinc-500">({units.length})</span>
          <span className="ml-2 text-xs text-zinc-500">
            Carton, Pack, Kilogram, Pallet… — the units product categories count and store in.
          </span>
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-left text-xs">
                <th className="py-1.5 pr-2 font-medium w-24">Code</th>
                <th className="py-1.5 pr-2 font-medium">Name</th>
                <th className="py-1.5 pr-2 font-medium">Name (ID)</th>
                <th className="py-1.5 pr-2 font-medium">Name (ZH)</th>
                <th className="py-1.5 pr-2 font-medium w-20 text-right">Decimals</th>
                <th className="py-1.5 pr-2 font-medium w-24 text-right">Categories</th>
                <th className="py-1.5 w-32" />
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const isEditing = editing?.id === u.id;
                const set = (d: Draft) => setEditing({ id: u.id, draft: d });
                return (
                  <tr key={u.id} className="border-t border-zinc-800">
                    {isEditing ? (
                      <>
                        <td className="py-1.5 pr-2">{field(editing.draft, set, "code", "font-mono")}</td>
                        <td className="py-1.5 pr-2">{field(editing.draft, set, "name")}</td>
                        <td className="py-1.5 pr-2">{field(editing.draft, set, "nameId")}</td>
                        <td className="py-1.5 pr-2">{field(editing.draft, set, "nameZh")}</td>
                        <td className="py-1.5 pr-2">
                          {u.categoryCount > 0 ? (
                            <span className="block text-right font-mono text-zinc-400" title="Fixed while a category uses this unit">
                              {u.decimals}
                            </span>
                          ) : (
                            field(editing.draft, set, "decimals", "text-right font-mono")
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 pr-2 font-mono text-amber-500">{u.code}</td>
                        <td className="py-1.5 pr-2">{u.name}</td>
                        <td className="py-1.5 pr-2 text-zinc-400">{u.nameId ?? <span className="text-zinc-600">—</span>}</td>
                        <td className="py-1.5 pr-2 text-zinc-400">{u.nameZh ?? <span className="text-zinc-600">—</span>}</td>
                        <td className="py-1.5 pr-2 text-right font-mono text-zinc-400">{u.decimals}</td>
                      </>
                    )}
                    <td className="py-1.5 pr-2 text-right font-mono text-zinc-500">{u.categoryCount}</td>
                    <td className="py-1.5 text-right space-x-3 text-xs whitespace-nowrap">
                      {isEditing ? (
                        <>
                          <button type="button" disabled={busy} onClick={saveEdit} className="text-amber-500 hover:underline">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="text-zinc-500 hover:underline">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing({ id: u.id, draft: toDraft(u) })}
                            className="text-amber-500 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy || u.categoryCount > 0}
                            title={u.categoryCount > 0 ? "Used by a category" : undefined}
                            onClick={() => {
                              if (window.confirm(`Delete unit ${u.name}?`)) call(`/api/units/${u.id}`, "DELETE");
                            }}
                            className="text-red-400 hover:underline disabled:opacity-40 disabled:no-underline"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
            <div className="w-24">
              <label className="block text-[11px] text-zinc-500 mb-1">Code</label>
              <input
                type="text"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="KG"
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-zinc-500 mb-1">Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Kilogram"
                className={inputClass}
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[11px] text-zinc-500 mb-1">Name (ID, optional)</label>
              <input
                type="text"
                value={draft.nameId}
                onChange={(e) => setDraft({ ...draft, nameId: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[11px] text-zinc-500 mb-1">Name (ZH, optional)</label>
              <input
                type="text"
                value={draft.nameZh}
                onChange={(e) => setDraft({ ...draft, nameZh: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="w-24">
              <label className="block text-[11px] text-zinc-500 mb-1">Decimals</label>
              <input
                type="number"
                min={0}
                max={6}
                value={draft.decimals}
                onChange={(e) => setDraft({ ...draft, decimals: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !draft.code.trim() || !draft.name.trim()}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50"
            >
              Add unit
            </button>
          </form>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
