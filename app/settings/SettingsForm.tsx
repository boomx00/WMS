"use client";

import { useState } from "react";

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
  };
}) {
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
    <div className="space-y-4 max-w-2xl">
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
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${
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
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${
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
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${
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
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${
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
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${
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
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${
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
            disabled={saving}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ml-4 ${
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
  );
}