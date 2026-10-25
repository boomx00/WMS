"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  type WarehouseRow,
} from "./locationUi";

// Add (warehouse = null) or edit a warehouse: its name, and whether it's
// active. An inactive warehouse isn't offered on the PDA and can't get new
// locations; its locations and stock stay and still show on the web. An
// empty warehouse can also be deleted here.
export default function WarehouseModal({
  warehouse,
  isDefault,
  activeCount,
  total,
  readOnly,
  labels,
  onClose,
}: {
  warehouse: WarehouseRow | null;
  isDefault: boolean; // the first active one
  activeCount: number;
  total: number;
  readOnly: boolean;
  labels: Labels;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(warehouse?.name ?? "");
  const [isActive, setIsActive] = useState(warehouse?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The default warehouse and the last active one stay active.
  const lockedActive = !!warehouse && warehouse.isActive && (isDefault || activeCount <= 1);
  const deleteBlocked = !warehouse
    ? null
    : warehouse.locationCount > 0
      ? fill(labels.warehouse_in_use, { n: warehouse.locationCount })
      : total <= 1
        ? labels.warehouse_last
        : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setError(null);
    setSaving(true);

    const body: Record<string, unknown> = {};
    if (!warehouse || name.trim() !== warehouse.name) body.name = name.trim();
    if (!warehouse || isActive !== warehouse.isActive) body.isActive = isActive;
    if (warehouse && Object.keys(body).length === 0) {
      setSaving(false);
      onClose();
      return;
    }

    const res = await fetch(warehouse ? `/api/warehouses/${warehouse.id}` : "/api/warehouses", {
      method: warehouse ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await readError(res, "Failed to save warehouse")).error);
      return;
    }
    onClose();
    router.refresh();
  }

  async function handleDelete() {
    if (!warehouse || readOnly) return;
    if (!window.confirm(fill(labels.warehouse_confirm_delete, { name: warehouse.name }))) return;
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/warehouses/${warehouse.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setError((await readError(res, "Failed to delete warehouse")).error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Modal
      title={warehouse ? labels.modal_edit_warehouse : labels.modal_add_warehouse}
      subtitle={warehouse?.name}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={<ModalFooter readOnly={readOnly} saving={saving} labels={labels} onClose={onClose} />}
    >
      <Field label={labels.warehouse_name}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          required
          autoFocus={!readOnly}
          className={inputClass}
        />
      </Field>

      <div className="space-y-1.5">
        <Checkbox checked={isActive} onChange={setIsActive} disabled={readOnly || lockedActive}>
          {labels.field_warehouse_active}
        </Checkbox>
        <div className="pl-6 space-y-1">
          <Hint>{labels.hint_warehouse_active}</Hint>
          {lockedActive && isDefault && <Hint tone="warn">{labels.hint_warehouse_default}</Hint>}
          {lockedActive && !isDefault && <Hint tone="warn">{labels.warehouse_last}</Hint>}
        </div>
      </div>

      {warehouse && !readOnly && (
        <div className="pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleteBlocked !== null}
            className="px-3 py-1.5 rounded-md border border-zinc-800 text-xs text-red-400 hover:bg-red-950/30 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          >
            {labels.warehouse_delete}
          </button>
          {deleteBlocked && (
            <div className="mt-1">
              <Hint>{deleteBlocked}</Hint>
            </div>
          )}
        </div>
      )}

      {error && <Hint tone="error">{error}</Hint>}
    </Modal>
  );
}
