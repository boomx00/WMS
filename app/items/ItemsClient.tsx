"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cleanTags, sortTags } from "@/lib/itemTags";

type Item = {
  id: number;
  sku: string;
  legacySku: string | null;
  cartonBarcode: string | null;
  name: string;
  cartonBagQty: number;
  palletCartonQty: number;
  productType: string | null;
  brand: string | null;
  tags: string[];
  supplierId: number | null;
};

type Supplier = { id: number; name: string; kind: "PRODUCTION" | "EXTERNAL" };

// Every Type / Brand / Tag in use, offered as suggestions so the same value
// is typed the same way everywhere, and every supplier.
type Options = { types: string[]; brands: string[]; tags: string[]; suppliers: Supplier[] };

const KIND_LABEL: Record<Supplier["kind"], string> = { PRODUCTION: "Production", EXTERNAL: "External" };

const TYPE_LIST = "items-type-options";
const BRAND_LIST = "items-brand-options";
const ALL = "";
const NONE = "\u0000none"; // filter value: products with no Type / Brand

const inputClass =
  "w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500";

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

export default function ItemsClient({
  items,
  isAdmin,
  options,
}: {
  items: Item[];
  isAdmin: boolean;
  options: Options;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [brandFilter, setBrandFilter] = useState(ALL);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [supplierFilter, setSupplierFilter] = useState(ALL);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const supplierName = useMemo(() => new Map(options.suppliers.map((s) => [s.id, s.name])), [options.suppliers]);

  // Search matches SKU, legacy SKU, barcode, name, type, brand, tags and
  // supplier; Type / Brand / Supplier pick one value; every ticked tag must
  // be on the product.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (typeFilter === NONE ? item.productType : typeFilter !== ALL && lower(item.productType) !== lower(typeFilter))
        return false;
      if (brandFilter === NONE ? item.brand : brandFilter !== ALL && lower(item.brand) !== lower(brandFilter))
        return false;
      if (
        supplierFilter === NONE
          ? item.supplierId !== null
          : supplierFilter !== ALL && String(item.supplierId) !== supplierFilter
      )
        return false;
      const itemTags = item.tags.map(lower);
      if (!tagFilter.every((t) => itemTags.includes(t.toLowerCase()))) return false;
      if (words.length === 0) return true;
      const supplier = item.supplierId === null ? null : supplierName.get(item.supplierId);
      const haystack = [item.sku, item.legacySku, item.cartonBarcode, item.name, item.productType, item.brand, supplier, ...item.tags]
        .map(lower)
        .join(" ");
      // Every word somewhere ("makuku xl" finds MAKUKU products tagged XL).
      return words.every((w) => haystack.includes(w));
    });
  }, [items, search, typeFilter, brandFilter, tagFilter, supplierFilter, supplierName]);

  const filtering =
    search.trim() !== "" || typeFilter !== ALL || brandFilter !== ALL || supplierFilter !== ALL || tagFilter.length > 0;
  const shownSelected = shown.filter((i) => selected.has(i.id));
  const allShownSelected = shown.length > 0 && shownSelected.length === shown.length;

  function toggleSelected(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((current) => {
      const next = new Set(current);
      for (const i of shown) {
        if (allShownSelected) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  }

  function toggleTagFilter(tag: string) {
    setTagFilter((current) =>
      current.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? current.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...current, tag]
    );
  }

  const colCount = isAdmin ? 11 : 10;

  return (
    <div>
      <datalist id={TYPE_LIST}>
        {options.types.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id={BRAND_LIST}>
        {options.brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      {isAdmin && (
        <div className="mb-8 space-y-4">
          <CreateItemForm options={options} />
          <SuppliersPanel suppliers={options.suppliers} />
        </div>
      )}

      <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SKU, name, barcode, type, brand, tag or supplier…"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputClass}>
              <option value={ALL}>All types</option>
              {options.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={NONE}>(no type)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Brand</label>
            <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={inputClass}>
              <option value={ALL}>All brands</option>
              {options.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value={NONE}>(no brand)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Supplier</label>
            <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className={inputClass}>
              <option value={ALL}>All suppliers</option>
              {options.suppliers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
              <option value={NONE}>(no supplier)</option>
            </select>
          </div>
        </div>
        {options.tags.length > 0 && (
          <div>
            <span className="block text-[11px] text-zinc-500 mb-1">Tags (products with every ticked tag)</span>
            <div className="flex flex-wrap gap-1.5">
              {options.tags.map((tag) => {
                const on = tagFilter.some((t) => t.toLowerCase() === tag.toLowerCase());
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagFilter(tag)}
                    className={`px-2 py-0.5 rounded-full border text-xs font-mono transition-colors ${
                      on
                        ? "border-amber-500 bg-amber-500/15 text-amber-300"
                        : "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>
            {filtering
              ? `${shown.length.toLocaleString()} of ${items.length.toLocaleString()} products`
              : `${items.length.toLocaleString()} products`}
          </span>
          {filtering && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTypeFilter(ALL);
                setBrandFilter(ALL);
                setSupplierFilter(ALL);
                setTagFilter([]);
              }}
              className="text-amber-500 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {isAdmin && selected.size > 0 && (
        <BulkEditBar
          ids={[...selected]}
          options={options}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className="border border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900 text-zinc-500 text-left">
              {isAdmin && (
                <th className="pl-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={toggleAllShown}
                    aria-label="Select all shown products"
                    className="accent-amber-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 font-medium">Barcode</th>
              <th className="px-4 py-3 font-medium">Legacy SKU</th>
              <th className="px-4 py-3 font-medium">Current SKU</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Brand</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium text-right">Bags / Carton</th>
              <th className="px-4 py-3 font-medium text-right">Cartons / Pallet</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-zinc-600">
                  {items.length === 0 ? "No items yet." : "No products match the search and filters."}
                </td>
              </tr>
            ) : (
              shown.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  options={options}
                  selected={selected.has(item.id)}
                  onToggleSelected={() => toggleSelected(item.id)}
                  onTagClick={toggleTagFilter}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemRow({
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

// Tags as chips (× removes one) plus a box to type more: Enter or comma adds
// what's typed; tags already in use are suggested while typing.
function TagEditor({
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

// Manager: change Type / Brand / tags of every ticked product at once.
function BulkEditBar({
  ids,
  options,
  onClear,
}: {
  ids: number[];
  options: Options;
  onClear: () => void;
}) {
  const router = useRouter();
  const [productType, setProductType] = useState("");
  const [brand, setBrand] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTags, setRemoveTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply(change: Record<string, unknown>, label: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/items/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...change }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Failed to update" });
      return;
    }
    setMessage({ ok: true, text: `${label} — ${data.updated} product(s) updated.` });
    router.refresh();
  }

  const btn =
    "px-3 py-1.5 rounded-md border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap";

  return (
    <div className="border border-amber-900/60 bg-amber-950/10 rounded-lg p-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-amber-300">{ids.length.toLocaleString()} product(s) selected</span>
        <button type="button" onClick={onClear} className="text-xs text-zinc-500 hover:text-zinc-200">
          Clear selection
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Set type (empty clears it)</label>
          <div className="flex gap-2">
            <input
              type="text"
              list={TYPE_LIST}
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              placeholder="e.g. Diapers"
              className={inputClass}
            />
            <button type="button" disabled={busy} className={btn} onClick={() => apply({ productType }, `Type set to "${productType.trim() || "—"}"`)}>
              Set type
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Set brand (empty clears it)</label>
          <div className="flex gap-2">
            <input
              type="text"
              list={BRAND_LIST}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. MAKUKU"
              className={inputClass}
            />
            <button type="button" disabled={busy} className={btn} onClick={() => apply({ brand }, `Brand set to "${brand.trim() || "—"}"`)}>
              Set brand
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Set supplier</label>
          <div className="flex gap-2">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
              <option value="">(no supplier)</option>
              {options.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              className={btn}
              onClick={() =>
                apply(
                  { supplierId: supplierId ? Number(supplierId) : null },
                  `Supplier set to "${options.suppliers.find((s) => String(s.id) === supplierId)?.name ?? "—"}"`
                )
              }
            >
              Set supplier
            </button>
          </div>
        </div>
        <div className="hidden lg:block" />
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Add tags (keeps their other tags)</label>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <TagEditor value={addTags} onChange={setAddTags} suggestions={options.tags} placeholder="e.g. XL, 34+6" />
            </div>
            <button
              type="button"
              disabled={busy || addTags.length === 0}
              className={btn}
              onClick={() => apply({ addTags }, `Added ${addTags.join(", ")}`).then(() => setAddTags([]))}
            >
              Add tags
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1">Remove tags</label>
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <TagEditor value={removeTags} onChange={setRemoveTags} suggestions={options.tags} placeholder="Tags to take off" />
            </div>
            <button
              type="button"
              disabled={busy || removeTags.length === 0}
              className={btn}
              onClick={() => apply({ removeTags }, `Removed ${removeTags.join(", ")}`).then(() => setRemoveTags([]))}
            >
              Remove tags
            </button>
          </div>
        </div>
      </div>
      {message && <p className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>{message.text}</p>}
    </div>
  );
}

function CreateItemForm({ options }: { options: Options }) {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [legacySku, setLegacySku] = useState("");
  const [cartonBarcode, setCartonBarcode] = useState("");
  const [name, setName] = useState("");
  const [cartonBagQty, setCartonBagQty] = useState("");
  const [palletCartonQty, setPalletCartonQty] = useState("");
  const [productType, setProductType] = useState("");
  const [brand, setBrand] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        name,
        cartonBagQty: Number(cartonBagQty),
        palletCartonQty: Number(palletCartonQty),
        legacySku: legacySku.trim() || undefined,
        cartonBarcode: cartonBarcode.trim() || undefined,
        productType,
        brand,
        tags,
        supplierId: supplierId ? Number(supplierId) : null,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to create item");
      return;
    }

    setSuccess(`Created item ${sku}.`);
    setSku("");
    setLegacySku("");
    setCartonBarcode("");
    setName("");
    setCartonBagQty("");
    setPalletCartonQty("");
    // Type, brand and supplier stay filled in: the next product is usually the same.
    setTags([]);
    router.refresh();
  }

  const input = `${inputClass} font-mono`;

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">SKU</label>
          <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className={input} required />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Legacy Code (optional)</label>
          <input type="text" value={legacySku} onChange={(e) => setLegacySku(e.target.value)} className={input} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Carton Barcode (optional)</label>
          <input type="text" value={cartonBarcode} onChange={(e) => setCartonBarcode(e.target.value)} className={input} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Type (optional)</label>
          <input
            type="text"
            list={TYPE_LIST}
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
            placeholder="e.g. Diapers"
            className={inputClass}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-zinc-500 mb-1">Brand (optional)</label>
          <input
            type="text"
            list={BRAND_LIST}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. MAKUKU"
            className={inputClass}
          />
        </div>
        <div className="flex-[2] min-w-[220px]">
          <label className="block text-xs text-zinc-500 mb-1">Tags (optional)</label>
          <TagEditor value={tags} onChange={setTags} suggestions={options.tags} placeholder="e.g. XL, 34+6" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-zinc-500 mb-1">Supplier (optional)</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {options.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({KIND_LABEL[s.kind]})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Bags / Carton</label>
          <input
            type="number"
            min={1}
            value={cartonBagQty}
            onChange={(e) => setCartonBagQty(e.target.value)}
            className={input}
            required
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Cartons / Pallet</label>
          <input
            type="number"
            min={1}
            value={palletCartonQty}
            onChange={(e) => setPalletCartonQty(e.target.value)}
            className={input}
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !sku || !name || !cartonBagQty || !palletCartonQty}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Creating..." : "Create Item"}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400">{success}</p>}
    </form>
  );
}

// Manager: the supplier list — add, rename, switch Production / External,
// delete (only while no stock movement is recorded against it).
function SuppliersPanel({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Supplier["kind"]>("EXTERNAL");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await call("/api/suppliers", "POST", { name, kind })) setName("");
  }

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left text-sm"
      >
        <span>
          Suppliers <span className="text-zinc-500">({suppliers.length})</span>
          <span className="ml-2 text-xs text-zinc-500">
            Production inbound from the PDA is recorded against the Production supplier automatically.
          </span>
        </span>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-3">
          <table className="w-full max-w-2xl text-sm">
            <thead>
              <tr className="text-zinc-500 text-left text-xs">
                <th className="py-1.5 font-medium">Name</th>
                <th className="py-1.5 font-medium">Kind</th>
                <th className="py-1.5 w-32" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-zinc-800">
                  <td className="py-1.5">
                    {editing?.id === s.id ? (
                      <input
                        type="text"
                        value={editing.name}
                        autoFocus
                        onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" && (await call(`/api/suppliers/${s.id}`, "PATCH", { name: editing.name })))
                            setEditing(null);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="px-2 py-1 rounded bg-zinc-900 border border-amber-700 text-sm focus:outline-none"
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="py-1.5">
                    <select
                      value={s.kind}
                      disabled={busy}
                      onChange={(e) => call(`/api/suppliers/${s.id}`, "PATCH", { kind: e.target.value })}
                      className="bg-transparent text-sm text-zinc-300 focus:outline-none cursor-pointer"
                    >
                      <option value="PRODUCTION" className="bg-zinc-900">Production</option>
                      <option value="EXTERNAL" className="bg-zinc-900">External</option>
                    </select>
                  </td>
                  <td className="py-1.5 text-right space-x-3 text-xs">
                    {editing?.id === s.id ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (await call(`/api/suppliers/${s.id}`, "PATCH", { name: editing.name })) setEditing(null);
                        }}
                        className="text-amber-500 hover:underline"
                      >
                        Save
                      </button>
                    ) : (
                      <button type="button" onClick={() => setEditing({ id: s.id, name: s.name })} className="text-amber-500 hover:underline">
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Delete supplier ${s.name}? Its products are left without a supplier.`))
                          call(`/api/suppliers/${s.id}`, "DELETE");
                      }}
                      className="text-red-400 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={add} className="flex flex-wrap gap-2 items-end max-w-2xl">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] text-zinc-500 mb-1">New supplier</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. PT Contoh Packaging"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as Supplier["kind"])} className={inputClass}>
                <option value="EXTERNAL">External</option>
                <option value="PRODUCTION">Production</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50"
            >
              Add supplier
            </button>
          </form>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
