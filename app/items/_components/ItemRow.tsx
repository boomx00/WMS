"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cleanTags } from "@/lib/itemTags";
import type { Item, Options } from "./types";
import { TYPE_LIST, BRAND_LIST } from "./shared";
import { TagEditor } from "./TagEditor";

export function ItemRow({
  item,
  isAdmin,
  options,
  selected,
  onToggleSelected,
  onTagClick,
}: {
  item: Item;
  isAdmin: boolean;
  options: Options;
  selected: boolean;
  onToggleSelected: () => void;
  onTagClick: (tag: string) => void;
}) {
  const router = useRouter();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(field: string, currentValue: string | number | null) {
    if (!isAdmin) return;
    setEditingField(field);
    setValue(currentValue?.toString() ?? "");
  }

  async function save(field: string, newValue: unknown = value) {
    setSaving(true);
    await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [field]: field === "cartonBagQty" || field === "palletCartonQty" ? Number(newValue) : newValue,
      }),
    });
    setSaving(false);
    setEditingField(null);
    router.refresh();
  }

  function EditableCell({
    field,
    displayValue,
    mono = true,
    numeric = false,
    list,
  }: {
    field: string;
    displayValue: string;
    mono?: boolean;
    numeric?: boolean;
    list?: string;
  }) {
    if (editingField === field) {
      return (
        <div className="flex gap-1">
          <input
            type={numeric ? "number" : "text"}
            value={value}
            list={list}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save(field);
              if (e.key === "Escape") setEditingField(null);
            }}
            className="w-24 px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-xs font-mono focus:outline-none"
          />
          <button onClick={() => save(field)} disabled={saving} className="text-xs text-amber-500 hover:underline">
            {saving ? "..." : "Save"}
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => startEdit(field, displayValue)}
        disabled={!isAdmin}
        className={`${mono ? "font-mono" : ""} text-left ${
          isAdmin ? "hover:text-amber-500 cursor-pointer" : "cursor-default"
        }`}
      >
        {displayValue || (isAdmin ? "— set —" : "—")}
      </button>
    );
  }

  return (
    <tr className={`border-t border-zinc-800 hover:bg-zinc-900/50 ${selected ? "bg-amber-500/5" : ""}`}>
      {isAdmin && (
        <td className="pl-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Select ${item.sku}`}
            className="accent-amber-500"
          />
        </td>
      )}
      <td className="px-4 py-3 font-mono text-zinc-400">
        <EditableCell field="cartonBarcode" displayValue={item.cartonBarcode ?? ""} />
      </td>
      <td className="px-4 py-3">
        <EditableCell field="legacySku" displayValue={item.legacySku ?? ""} />
      </td>
      <td className="px-4 py-3 font-mono text-amber-500">
        <EditableCell field="sku" displayValue={item.sku} />
      </td>
      <td className="px-4 py-3">
        <EditableCell field="name" displayValue={item.name} mono={false} />
      </td>
      <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
        <EditableCell field="productType" displayValue={item.productType ?? ""} mono={false} list={TYPE_LIST} />
      </td>
      <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
        <EditableCell field="brand" displayValue={item.brand ?? ""} mono={false} list={BRAND_LIST} />
      </td>
      <td className="px-4 py-3 min-w-[10rem]">
        {editingField === "tags" ? (
          <div className="space-y-1">
            <TagEditor
              value={cleanTags(value)}
              onChange={(next) => setValue(next.join(", "))}
              suggestions={options.tags}
              autoFocus
              onEnterEmpty={() => save("tags", cleanTags(value))}
              onEscape={() => setEditingField(null)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => save("tags", cleanTags(value))}
                disabled={saving}
                className="text-xs text-amber-500 hover:underline"
              >
                {saving ? "..." : "Save"}
              </button>
              <button onClick={() => setEditingField(null)} className="text-xs text-zinc-500 hover:underline">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {item.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTagClick(tag)}
                title="Filter by this tag"
                className="px-1.5 py-0.5 rounded-full border border-zinc-700 text-[11px] font-mono text-zinc-300 hover:border-amber-500 hover:text-amber-300"
              >
                {tag}
              </button>
            ))}
            {isAdmin ? (
              <button
                onClick={() => startEdit("tags", item.tags.join(", "))}
                className="text-xs text-zinc-500 hover:text-amber-500"
              >
                {item.tags.length === 0 ? "— set —" : "edit"}
              </button>
            ) : (
              item.tags.length === 0 && <span className="text-zinc-600">—</span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
        {isAdmin ? (
          <select
            value={item.supplierId ?? ""}
            disabled={saving}
            onChange={(e) => save("supplierId", e.target.value ? Number(e.target.value) : null)}
            aria-label={`Supplier of ${item.sku}`}
            className={`max-w-[11rem] bg-transparent border-0 p-0 text-sm cursor-pointer hover:text-amber-500 focus:outline-none ${
              item.supplierId === null ? "text-zinc-600" : ""
            }`}
          >
            <option value="" className="bg-zinc-900">— set —</option>
            {options.suppliers.map((s) => (
              <option key={s.id} value={s.id} className="bg-zinc-900">
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          (options.suppliers.find((s) => s.id === item.supplierId)?.name ?? <span className="text-zinc-600">—</span>)
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-zinc-400">
        <EditableCell field="cartonBagQty" displayValue={item.cartonBagQty.toString()} numeric />
      </td>
      <td className="px-4 py-3 text-right font-mono text-zinc-400">
        <EditableCell field="palletCartonQty" displayValue={item.palletCartonQty.toString()} numeric />
      </td>
    </tr>
  );
}
