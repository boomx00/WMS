"use client";

import { useEffect, useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { useLanguage } from "@/lib/LanguageContext";
import { unitName } from "@/lib/uom";

// English text for this tab until its keys are added to lib/pageLabels.ts
// (settings_page); then they're editable on Settings → Translations.
export const LOCATION_STOCK_CARDS_LABELS: Record<string, string> = {
  location_stock_cards: "Location Stock Cards",
  location_stock_cards_description:
    "The cards at the top of the Location Stock page. Each card adds up the stock in the location types ticked for it. Units are optional: tick some to show the total in those units (a product counts in each one it has — e.g. Pack counts cartons × packs per carton plus loose packs); tick none to show each product in its own primary unit.",
  card_name: "Card name",
  card_location_types: "Location types",
  card_units: "Show in units",
  card_units_automatic: "Automatic (each product's primary unit)",
  card_add: "Add card",
  card_new: "New card",
  card_edit: "Edit",
  card_delete: "Delete",
  card_move_up: "Move up",
  card_move_down: "Move down",
  card_none: "No cards yet — the Location Stock page shows none.",
  card_confirm_delete: 'Delete the card "{name}"?',
  card_pick_type: "Tick at least one location type.",
  card_unknown_type: "(deleted type)",
  default_lang: "English",
  Indonesian: "Indonesian",
  Chinese: "Chinese",
  save: "Save",
  cancel: "Cancel",
};

type Card = {
  id: number;
  name: string;
  nameId: string | null;
  nameZh: string | null;
  locationTypes: string[];
  unitIds: number[];
};
type LocationType = { code: string; name: string };
type Unit = { id: number; code: string; name: string; nameId: string | null; nameZh: string | null };

type Draft = { name: string; nameId: string; nameZh: string; locationTypes: string[]; unitIds: number[] };
const emptyDraft: Draft = { name: "", nameId: "", nameZh: "", locationTypes: [], unitIds: [] };

// Settings → Location Stock Cards: the summary cards on the Location Stock
// page, in display order. Each has a name (with optional Indonesian /
// Chinese), the location types that add to it, and optional units.
export default function LocationStockCardsSettings({ readOnly = false }: { readOnly?: boolean }) {
  const labels = usePageLabels("settings_page", LOCATION_STOCK_CARDS_LABELS);
  const { language } = useLanguage();
  const [cards, setCards] = useState<Card[]>([]);
  const [types, setTypes] = useState<LocationType[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = closed, "new" = adding, a number = editing that card
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    (async () => {
      const [c, t, u] = await Promise.all([
        fetch("/api/location-stock-cards"),
        fetch("/api/location-types"),
        fetch("/api/units"),
      ]);
      if (c.ok) setCards(await c.json());
      else setError("Failed to load cards");
      if (t.ok) setTypes(((await t.json()) as LocationType[]).map(({ code, name }) => ({ code, name })));
      if (u.ok) setUnits(await u.json());
      setLoading(false);
    })();
  }, []);

  async function reload() {
    const res = await fetch("/api/location-stock-cards");
    if (res.ok) setCards(await res.json());
  }

  // Runs a change, shows its error if any, then reloads the list.
  async function run(request: Promise<Response>) {
    setBusy(true);
    setError(null);
    const res = await request;
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `Failed (${res.status})`);
      return false;
    }
    await reload();
    return true;
  }

  function openNew() {
    setDraft(emptyDraft);
    setEditing("new");
    setError(null);
  }

  function openEdit(card: Card) {
    setDraft({
      name: card.name,
      nameId: card.nameId ?? "",
      nameZh: card.nameZh ?? "",
      locationTypes: card.locationTypes,
      unitIds: card.unitIds,
    });
    setEditing(card.id);
    setError(null);
  }

  async function save() {
    if (!draft.name.trim()) return;
    if (draft.locationTypes.length === 0) {
      setError(labels.card_pick_type);
      return;
    }
    const body = JSON.stringify({
      name: draft.name.trim(),
      nameId: draft.nameId,
      nameZh: draft.nameZh,
      locationTypes: draft.locationTypes,
      unitIds: draft.unitIds,
    });
    const ok = await run(
      editing === "new"
        ? fetch("/api/location-stock-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body })
        : fetch(`/api/location-stock-cards/${editing}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body,
          })
    );
    if (ok) setEditing(null);
  }

  async function remove(card: Card) {
    if (!window.confirm(labels.card_confirm_delete.replace("{name}", card.name))) return;
    await run(fetch(`/api/location-stock-cards/${card.id}`, { method: "DELETE" }));
  }

  async function move(index: number, direction: -1 | 1) {
    const ids = cards.map((c) => c.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await run(
      fetch("/api/location-stock-cards/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
    );
  }

  const typeName = (code: string) => types.find((t) => t.code === code)?.name ?? `${code} ${labels.card_unknown_type}`;
  const unitsText = (ids: number[]) =>
    ids.length === 0
      ? labels.card_units_automatic
      : ids
          .map((id) => units.find((u) => u.id === id))
          .filter((u): u is Unit => !!u)
          .map((u) => unitName(u, language))
          .join(" · ");

  const small =
    "px-2 py-1 rounded-md border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-30 disabled:hover:bg-transparent transition-colors";
  const input =
    "flex-1 min-w-32 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500 placeholder:text-zinc-600";
  const chip = (on: boolean) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm select-none cursor-pointer ${
      on ? "border-amber-600 bg-amber-500/10 text-zinc-100" : "border-zinc-700 text-zinc-400"
    }`;

  const editor = (
    <div className="border border-amber-700/50 rounded-lg p-4 bg-zinc-950/40 space-y-4">
      <div className="text-sm font-medium">{editing === "new" ? labels.card_new : labels.card_edit}</div>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={labels.card_name}
          aria-label={`${labels.card_name} (${labels.default_lang})`}
          autoFocus
          className={input}
        />
        <input
          type="text"
          value={draft.nameId}
          onChange={(e) => setDraft({ ...draft, nameId: e.target.value })}
          placeholder={labels.Indonesian}
          aria-label={`${labels.card_name} (${labels.Indonesian})`}
          className={input}
        />
        <input
          type="text"
          value={draft.nameZh}
          onChange={(e) => setDraft({ ...draft, nameZh: e.target.value })}
          placeholder={labels.Chinese}
          aria-label={`${labels.card_name} (${labels.Chinese})`}
          className={input}
        />
      </div>

      <div>
        <div className="text-xs text-zinc-400 mb-2">{labels.card_location_types}</div>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => {
            const on = draft.locationTypes.includes(t.code);
            return (
              <label key={t.code} className={chip(on)}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      locationTypes: on
                        ? draft.locationTypes.filter((c) => c !== t.code)
                        : [...draft.locationTypes, t.code],
                    })
                  }
                  className="accent-amber-500"
                />
                {t.name}
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs text-zinc-400 mb-2">{labels.card_units}</div>
        <div className="flex flex-wrap gap-2">
          {units.map((u) => {
            const on = draft.unitIds.includes(u.id);
            return (
              <label key={u.id} className={chip(on)}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      unitIds: on ? draft.unitIds.filter((id) => id !== u.id) : [...draft.unitIds, u.id],
                    })
                  }
                  className="accent-amber-500"
                />
                {unitName(u, language)}
                <span className="font-mono text-[11px] text-zinc-500">{u.code}</span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500 mt-2">{unitsText(draft.unitIds)}</p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !draft.name.trim()}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {labels.save}
        </button>
        <button type="button" onClick={() => setEditing(null)} className={small}>
          {labels.cancel}
        </button>
      </div>
    </div>
  );

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div>
        <h2 className="text-sm font-medium mb-1">{labels.location_stock_cards}</h2>
        <p className="text-xs text-zinc-500">{labels.location_stock_cards_description}</p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-zinc-600">Loading...</p>
      ) : (
        <>
          {cards.length === 0 ? (
            <p className="text-xs text-zinc-600">{labels.card_none}</p>
          ) : (
            <div className="space-y-2">
              {cards.map((card, index) =>
                editing === card.id ? (
                  <div key={card.id}>{editor}</div>
                ) : (
                  <div key={card.id} className="border border-zinc-800 rounded-lg px-4 py-3 flex gap-3 items-start">
                    <span className="font-mono text-xs text-zinc-600 pt-0.5">{index + 1}</span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-sm text-zinc-200">
                        {card.name}
                        {(card.nameId || card.nameZh) && (
                          <span className="ml-2 text-xs text-zinc-500">
                            {[card.nameId, card.nameZh].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {card.locationTypes.map((code) => (
                          <span
                            key={code}
                            className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded"
                          >
                            {typeName(code)}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {labels.card_units}: {unitsText(card.unitIds)}
                      </div>
                    </div>
                    {!readOnly && (
                      <div className="flex gap-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={busy || index === 0}
                          title={labels.card_move_up}
                          aria-label={labels.card_move_up}
                          className={small}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={busy || index === cards.length - 1}
                          title={labels.card_move_down}
                          aria-label={labels.card_move_down}
                          className={small}
                        >
                          ↓
                        </button>
                        <button type="button" onClick={() => openEdit(card)} disabled={busy} className={small}>
                          {labels.card_edit}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(card)}
                          disabled={busy}
                          className={`${small} hover:text-red-400`}
                        >
                          {labels.card_delete}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {!readOnly &&
            (editing === "new" ? (
              editor
            ) : (
              <button
                type="button"
                onClick={openNew}
                disabled={busy || editing !== null}
                className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {labels.card_add}
              </button>
            ))}
        </>
      )}
    </div>
  );
}
