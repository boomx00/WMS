"use client";

import { useMemo, useState } from "react";
import type { Item, Options } from "./_components/types";
import { TYPE_LIST, BRAND_LIST, ALL, NONE, inputClass, lower } from "./_components/shared";
import { ItemRow } from "./_components/ItemRow";
import { BulkEditBar } from "./_components/BulkEditBar";
import { CreateItemForm } from "./_components/CreateItemForm";
import { SuppliersPanel } from "./_components/SuppliersPanel";

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
