"use client";

import { useState } from "react";
import PageLabelsSettings from "./PageLabelsSettings";
import { useCan } from "@/lib/AccessContext";

export default function SettingsForm({
  initial,
}: {
  initial: {
    allowDefaultCodeTransactions: boolean;
    automaticInbound: boolean;
    automaticInboundFromRack: boolean;
    allowUntrackedOutbound: boolean;
    allowDefaultPicking: boolean;
    allowNegativeFloorStock: boolean;
    allowNegativeRackStock: boolean;
    ledgerStartAt: string; // ISO, UTC
    ledgerStartIsDefault: boolean;
  };
}) {
  const [activeTab, setActiveTab] = useState<"general" | "translations">("general");
  const canEdit = useCan()("settings.edit");

  const [allowDefaultCode, setAllowDefaultCode] = useState(initial.allowDefaultCodeTransactions);
  const [automaticInbound, setAutomaticInbound] = useState(initial.automaticInbound);
  const [automaticInboundFromRack, setAutomaticInboundFromRack] = useState(
    initial.automaticInboundFromRack
  );
  const [allowUntrackedOutbound, setAllowUntrackedOutbound] = useState(initial.allowUntrackedOutbound);
  const [allowDefaultPicking, setAllowDefaultPicking] = useState(initial.allowDefaultPicking);
  const [allowNegativeFloorStock, setAllowNegativeFloorStock] = useState(initial.allowNegativeFloorStock);
  const [allowNegativeRackStock, setAllowNegativeRackStock] = useState(initial.allowNegativeRackStock);
  const [saving, setSaving] = useState(false);

  async function updateSetting(key: string, value: boolean) {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    setSaving(false);
  }

  return (
    <div className="max-w-2xl">
      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        <TabButton label="General" active={activeTab === "general"} onClick={() => setActiveTab("general")} />
        <TabButton
          label="Translations"
          active={activeTab === "translations"}
          onClick={() => setActiveTab("translations")}
        />
      </div>

      {activeTab === "translations" ? (
        <PageLabelsSettings readOnly={!canEdit} />
      ) : (
        <div className="space-y-4">
          {!canEdit && (
            <p className="text-xs text-zinc-500 border border-zinc-800 rounded-md px-3 py-2">
              Read-only — your role can view settings but not change them.
            </p>
          )}
          <LedgerStartSetting
            readOnly={!canEdit}
            initialIso={initial.ledgerStartAt}
            initialIsDefault={initial.ledgerStartIsDefault}
          />

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Allow default-code transactions</div>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Enables scanning a SKU&apos;s <code>*default</code> barcode for
                  bulk-entering pre-existing stock without individual pallet
                  labels.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !allowDefaultCode;
                  setAllowDefaultCode(next);
                  updateSetting("allowDefaultCodeTransactions", next);
                }}
                disabled={saving || !canEdit}
                className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
                  allowDefaultCode ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    allowDefaultCode ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Automatic Inbound (from Floor)</div>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Lets Move auto-create a missing INBOUND record when moving an
                  untracked pallet off the Floor — for migrating pre-existing
                  stock. Turn off once existing floor stock is migrated.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !automaticInbound;
                  setAutomaticInbound(next);
                  updateSetting("automaticInbound", next);
                }}
                disabled={saving || !canEdit}
                className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
                  automaticInbound ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    automaticInbound ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Automatic Inbound (from Rack)</div>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Same as above, but for pallets already sitting on a rack that
                  were never scanned in. Applies when moving Rack → Floor or
                  Rack → Rack. Turn off once existing rack stock is migrated.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !automaticInboundFromRack;
                  setAutomaticInboundFromRack(next);
                  updateSetting("automaticInboundFromRack", next);
                }}
                disabled={saving || !canEdit}
                className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
                  automaticInboundFromRack ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    automaticInboundFromRack ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Allow untracked outbound</div>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Lets staff log an outbound scan for a location with zero
                  tracked stock, without affecting any stock numbers — for
                  recording activity on cells that were never stock-counted.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !allowUntrackedOutbound;
                  setAllowUntrackedOutbound(next);
                  updateSetting("allowUntrackedOutbound", next);
                }}
                disabled={saving || !canEdit}
                className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
                  allowUntrackedOutbound ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    allowUntrackedOutbound ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Default Picking (Picking v2)</div>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Lets Picking (v2) proceed when a scanned rack cell has no
                  recorded stock, or not enough of the expected SKU — the
                  source is clamped to 0 rather than blocking or going
                  negative, and the destination still receives the full
                  amount. A different product occupying the cell always
                  blocks regardless of this setting.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !allowDefaultPicking;
                  setAllowDefaultPicking(next);
                  updateSetting("allowDefaultPicking", next);
                }}
                disabled={saving || !canEdit}
                className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
                  allowDefaultPicking ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    allowDefaultPicking ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Allow negative floor stock</div>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Lets Move In (v2) reduce Floor&apos;s recorded total below
                  zero, instead of blocking when the requested quantity
                  exceeds what&apos;s currently tracked there. Floor is
                  clamped to exactly 0 rather than going negative.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !allowNegativeFloorStock;
                  setAllowNegativeFloorStock(next);
                  updateSetting("allowNegativeFloorStock", next);
                }}
                disabled={saving || !canEdit}
                className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
                  allowNegativeFloorStock ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    allowNegativeFloorStock ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Default Move (Perpindahan Lokasi v2)</div>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Lets Rack → Rack (v2) proceed even when the source cell
                  doesn&apos;t have enough tracked stock — the destination
                  still receives the full counted amount, and the source is
                  clamped to 0 rather than blocking or going negative. Also
                  governs Picking (v2) the same way, since they share this
                  one setting.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !allowNegativeRackStock;
                  setAllowNegativeRackStock(next);
                  updateSetting("allowNegativeRackStock", next);
                }}
                disabled={saving || !canEdit}
                className={`relative w-12 h-7 disabled:cursor-not-allowed rounded-full transition-colors shrink-0 ml-4 ${
                  allowNegativeRackStock ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    allowNegativeRackStock ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The ledger start is stored in UTC but entered/shown in WIB (UTC+7), the
// same way the old hard-coded LEDGER_START_AT was described.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function isoToWibInput(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16);
}

function wibInputToIso(value: string): string | null {
  const d = new Date(`${value}:00.000+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function LedgerStartSetting({
  initialIso,
  initialIsDefault,
  readOnly,
}: {
  initialIso: string;
  initialIsDefault: boolean;
  readOnly: boolean;
}) {
  const [savedIso, setSavedIso] = useState(initialIso);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [value, setValue] = useState(isoToWibInput(initialIso));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = value !== isoToWibInput(savedIso);

  async function save(ledgerStartAt: string | null) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledgerStartAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      const nextIso = new Date(data.ledgerStartAt).toISOString();
      setSavedIso(nextIso);
      setValue(isoToWibInput(nextIso));
      setIsDefault(ledgerStartAt === null);
      setMessage({ kind: "ok", text: "Saved" });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    const iso = wibInputToIso(value);
    if (!iso) {
      setMessage({ kind: "error", text: "Pick a valid date and time" });
      return;
    }
    save(iso);
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
      <div className="text-sm font-medium">Ledger start</div>
      <p className="text-xs text-zinc-500 mt-1 max-w-sm">
        Total Stock ledgers (per SKU and per location) begin at this moment,
        with an opening balance computed back from live stock. Events before
        it are not shown. Time is WIB (UTC+7).
        {isDefault && " Currently using the built-in default."}
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMessage(null);
          }}
          disabled={readOnly}
          className="px-3 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 [color-scheme:dark] disabled:opacity-60"
        />
        {!readOnly && (
        <button
          onClick={handleSave}
          disabled={saving || !dirty || !value}
          className="px-3 py-1.5 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        )}
        {!readOnly && !isDefault && (
          <button
            onClick={() => save(null)}
            disabled={saving}
            className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
          >
            Reset to default
          </button>
        )}
        {message && (
          <span className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active ? "border-amber-500 text-amber-500" : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}