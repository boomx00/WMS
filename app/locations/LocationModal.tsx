"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOCKED_LOCATION_CODES, TYPE_LOCKED_LOCATION_CODES } from "@/lib/locationLocks";
import {
  Checkbox,
  Field,
  Hint,
  Modal,
  ModalFooter,
  fill,
  inputClass,
  readError,
  type Labels,
  type LocationRowData,
  type StockColumnOption,
  type TypeRow,
  type WarehouseRow,
} from "./locationUi";

// Add (location = null) or edit a location. `columnForType` is the Total
// Stock column most locations of each type use, per warehouse
// ("warehouseId:TYPE") — the default for a new one.
export default function LocationModal({
  location,
  types,
  columns,
  warehouses,
  initialWarehouseId,
  columnForType,
  readOnly,
  labels,
  onClose,
}: {
  location: LocationRowData | null;
  types: TypeRow[];
  columns: StockColumnOption[]; // every warehouse's
  warehouses: WarehouseRow[];
  initialWarehouseId: number | null; // for a new location
  columnForType: Record<string, number | null>;
  readOnly: boolean;
  labels: Labels;
  onClose: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(location?.code ?? "");
  const [typeCode, setTypeCode] = useState(location?.type ?? "");
  const [warehouseId, setWarehouseId] = useState<number | null>(location?.warehouseId ?? initialWarehouseId);
  const [area, setArea] = useState(location?.area ?? "");
  const [x, setX] = useState(location?.x != null ? String(location.x) : "");
  const [y, setY] = useState(location?.y != null ? String(location.y) : "");
  const [countsInTotalStock, setCountsInTotalStock] = useState(location?.countsInTotalStock ?? true);
  const [stockColumnId, setStockColumnId] = useState<number | null>(location ? location.stockColumnId : null);
  // For a new location the column follows the type (whatever most
  // locations of that type show under) until it's picked by hand.
  const [columnTouched, setColumnTouched] = useState(!!location);
  // Receiving or staging, not both.
  const [purpose, setPurpose] = useState<"" | "receiving" | "staging">(
    location?.isReceiving ? "receiving" : location?.isStaging ? "staging" : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = types.find((t) => t.code === typeCode) ?? null;
  // Only the chosen warehouse's columns.
  const warehouseColumns = columns.filter((c) => c.warehouseId === warehouseId);
  const codeLocked = !!location && LOCKED_LOCATION_CODES.includes(location.code);
  const typeLocked = !!location && TYPE_LOCKED_LOCATION_CODES.includes(location.code);
  const renamed = !!location && !codeLocked && code.trim() !== location.code;
  const crowded =
    !!location &&
    !!selectedType &&
    selectedType.code !== location.type &&
    !selectedType.allowsMultipleSku &&
    location.skuCount > 1;

  function handleTypeChange(next: string) {
    setTypeCode(next);
    const nextType = types.find((t) => t.code === next);
    if (!columnTouched && nextType) setStockColumnId(columnForType[`${warehouseId}:${nextType.code}`] ?? null);
  }

  // Another warehouse has other columns: keep the column only if it's one
  // of the new warehouse's, otherwise start from that warehouse's usual
  // column for the type (or Total only).
  function handleWarehouseChange(next: number) {
    setWarehouseId(next);
    const stillValid = stockColumnId !== null && columns.some((c) => c.id === stockColumnId && c.warehouseId === next);
    if (!stillValid) setStockColumnId(typeCode ? columnForType[`${next}:${typeCode}`] ?? null : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setError(null);
    setSaving(true);

    const res = await fetch(location ? `/api/locations/${location.id}` : "/api/locations", {
      method: location ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.trim(),
        type: typeCode,
        warehouseId,
        area: selectedType?.hasPosition ? area.trim() : null,
        x: selectedType?.hasPosition ? x : null,
        y: selectedType?.hasPosition ? y : null,
        isReceiving: purpose === "receiving",
        isStaging: purpose === "staging",
        countsInTotalStock,
        stockColumnId: countsInTotalStock ? stockColumnId : null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      setError((await readError(res, "Failed to save location")).error);
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <Modal
      title={location ? labels.modal_edit_location : labels.modal_add_location}
      subtitle={
        location && (
          <span className="flex items-center gap-3">
            <span className="font-mono">{location.code}</span>
            <a
              href={`/locations/print/${encodeURIComponent(location.code)}`}
              className="text-amber-500 hover:underline"
            >
              {labels.print_label}
            </a>
          </span>
        )
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={<ModalFooter readOnly={readOnly} saving={saving} labels={labels} onClose={onClose} />}
    >
      <Field label={labels.field_code}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={readOnly || codeLocked}
          required
          autoFocus={!readOnly && !codeLocked}
          className={`${inputClass} font-mono`}
        />
        {codeLocked && !readOnly && (
          <div className="mt-1">
            <Hint>{labels.hint_locked_code}</Hint>
          </div>
        )}
        {renamed && (
          <div className="mt-1">
            <Hint tone="warn">{labels.hint_rename}</Hint>
          </div>
        )}
      </Field>

      {warehouses.length > 1 && (
        <Field label={labels.field_warehouse}>
          <select
            value={warehouseId ?? ""}
            onChange={(e) => handleWarehouseChange(Number(e.target.value))}
            disabled={readOnly}
            required
            className={inputClass}
          >
            {/* Inactive warehouses don't get new locations; a location
                already in one keeps showing it. */}
            {warehouses
              .filter((w) => w.isActive || w.id === location?.warehouseId)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.isActive ? w.name : `${w.name} ${labels.warehouse_inactive_suffix}`}
                </option>
              ))}
          </select>
        </Field>
      )}

      <Field label={labels.field_type}>
        <select
          value={typeCode}
          onChange={(e) => handleTypeChange(e.target.value)}
          disabled={readOnly || typeLocked}
          required
          className={inputClass}
        >
          <option value="" disabled>
            {labels.select_type}
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.code}>
              {t.name} — {t.allowsMultipleSku ? labels.sku_multiple : labels.sku_single}
            </option>
          ))}
        </select>
        {typeLocked && !readOnly && (
          <div className="mt-1">
            <Hint>{labels.hint_locked_type}</Hint>
          </div>
        )}
        {crowded && (
          <div className="mt-1">
            <Hint tone="warn">{fill(labels.hint_location_crowded, { n: location!.skuCount })}</Hint>
          </div>
        )}
      </Field>

      {selectedType?.hasPosition && (
        <div className="grid grid-cols-3 gap-3">
          <Field label={labels.field_area}>
            <input
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={readOnly}
              required
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label={labels.field_x}>
            <input
              type="number"
              min={1}
              step={1}
              value={x}
              onChange={(e) => setX(e.target.value)}
              disabled={readOnly}
              required
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label={labels.field_y}>
            <input
              type="number"
              min={1}
              step={1}
              value={y}
              onChange={(e) => setY(e.target.value)}
              disabled={readOnly}
              required
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>
      )}

      <div className="space-y-2">
        <Checkbox checked={countsInTotalStock} onChange={setCountsInTotalStock} disabled={readOnly}>
          {labels.field_counts_total}
        </Checkbox>
        {countsInTotalStock && (
          <div className="pl-6">
            <Field label={labels.field_total_column}>
              <select
                value={stockColumnId ?? ""}
                onChange={(e) => {
                  setStockColumnId(e.target.value ? Number(e.target.value) : null);
                  setColumnTouched(true);
                }}
                disabled={readOnly}
                className={inputClass}
              >
                {warehouseColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="">{labels.bucket_none}</option>
              </select>
              <div className="mt-1">
                <Hint>
                  {labels.hint_columns}
                  {warehouses.length > 1 && ` ${labels.hint_warehouse_columns}`}
                </Hint>
              </div>
            </Field>
          </div>
        )}
      </div>

      <Field label={labels.field_role}>
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as "" | "receiving" | "staging")}
          disabled={readOnly}
          className={inputClass}
        >
          <option value="">{labels.purpose_none}</option>
          <option value="receiving">{labels.purpose_receiving}</option>
          <option value="staging">{labels.purpose_staging}</option>
        </select>
        <div className="mt-1">
          <Hint>{labels.hint_role}</Hint>
        </div>
      </Field>

      {error && <Hint tone="error">{error}</Hint>}
    </Modal>
  );
}
