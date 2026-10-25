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
  type TypeRow,
} from "./locationUi";

// Add (type = null) or edit a location type. `positionMissing` and
// `crowded` are counts of this type's locations, for the warnings below.
export default function LocationTypeModal({
  type,
  positionMissing,
  crowded,
  readOnly,
  labels,
  onClose,
}: {
  type: TypeRow | null;
  positionMissing: number;
  crowded: number;
  readOnly: boolean;
  labels: Labels;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(type?.name ?? "");
  // null = not chosen yet (new types must pick one of the two boxes)
  const [allowsMultipleSku, setAllowsMultipleSku] = useState<boolean | null>(type ? type.allowsMultipleSku : null);
  const [hasPosition, setHasPosition] = useState(type?.hasPosition ?? false);
  const [pickable, setPickable] = useState(type?.pickable ?? false);
  const [maxPallets, setMaxPallets] = useState(type?.maxPallets != null ? String(type.maxPallets) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchingToSingle = !!type && type.allowsMultipleSku && allowsMultipleSku === false;
  const turningOnPosition = !!type && !type.hasPosition && hasPosition;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setError(null);

    if (allowsMultipleSku === null) {
      setError(labels.error_choose_sku_rule);
      return;
    }

    setSaving(true);
    const res = await fetch(type ? `/api/location-types/${type.id}` : "/api/location-types", {
      method: type ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        allowsMultipleSku,
        hasPosition,
        pickable,
        maxPallets: maxPallets.trim() === "" ? null : Number(maxPallets),
      }),
    });
    setSaving(false);

    if (!res.ok) {
      setError((await readError(res, "Failed to save location type")).error);
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <Modal
      title={type ? labels.modal_edit_type : labels.modal_add_type}
      subtitle={
        type ? (
          <span className="font-mono">{type.code}</span>
        ) : (
          labels.type_code_note
        )
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={<ModalFooter readOnly={readOnly} saving={saving} labels={labels} onClose={onClose} />}
    >
      <Field label={labels.field_name}>
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

      <div>
        <p className="text-xs text-zinc-500 mb-2">{labels.field_sku_rule}</p>
        <div className="space-y-2">
          {/* Two boxes, exactly one ticked — behaves like a choice of two. */}
          <Checkbox
            checked={allowsMultipleSku === false}
            onChange={() => setAllowsMultipleSku(false)}
            disabled={readOnly}
          >
            {labels.opt_only_one_sku}
          </Checkbox>
          <Checkbox
            checked={allowsMultipleSku === true}
            onChange={() => setAllowsMultipleSku(true)}
            disabled={readOnly}
          >
            {labels.opt_more_than_one_sku}
          </Checkbox>
        </div>
        {switchingToSingle && crowded > 0 && (
          <div className="mt-2">
            <Hint tone="warn">{fill(labels.hint_type_crowded, { n: crowded })}</Hint>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">{labels.field_other_rules}</p>
        <div className="space-y-2">
          <Checkbox checked={hasPosition} onChange={setHasPosition} disabled={readOnly}>
            {labels.opt_has_position}
          </Checkbox>
          <Checkbox checked={pickable} onChange={setPickable} disabled={readOnly}>
            {labels.opt_pickable}
          </Checkbox>
        </div>
        {turningOnPosition && positionMissing > 0 && (
          <div className="mt-2">
            <Hint tone="warn">{fill(labels.hint_position_missing, { n: positionMissing })}</Hint>
          </div>
        )}
      </div>

      <Field label={labels.field_max_pallets}>
        <div className="w-40">
          <input
            type="number"
            min={1}
            step={1}
            value={maxPallets}
            onChange={(e) => setMaxPallets(e.target.value)}
            placeholder={labels.max_pallets_placeholder}
            disabled={readOnly}
            className={inputClass}
          />
        </div>
      </Field>

      {error && <Hint tone="error">{error}</Hint>}
    </Modal>
  );
}
