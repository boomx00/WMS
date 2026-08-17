"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  };
}) {
  const router = useRouter();
  const [allowDefaultCode, setAllowDefaultCode] = useState(initial.allowDefaultCodeTransactions);
  const [automaticInbound, setAutomaticInbound] = useState(initial.automaticInbound);
  const [automaticInboundFromRack, setAutomaticInboundFromRack] = useState(
    initial.automaticInboundFromRack
  );
  const [allowUntrackedOutbound, setAllowUntrackedOutbound] = useState(initial.allowUntrackedOutbound);
  const [allowDefaultPicking, setAllowDefaultPicking] = useState(initial.allowDefaultPicking);
  const [saving, setSaving] = useState(false);
const [allowNegativeFloorStock, setAllowNegativeFloorStock] = useState(initial.allowNegativeFloorStock);
  async function updateSetting(key: string, value: boolean) {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Allow default-code transactions</div>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Lets staff use an item&apos;s default code (SKU*default) for
              initial stock entry, instead of scanning a real pallet label.
              Turn this off once initial stocking is complete.
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
            <div className="text-sm font-medium">Automatic inbound (from Floor)</div>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              When moving a pallet off the Floor to a rack, if its label was
              never scanned in, automatically create the inbound record too
              instead of blocking the move. For migrating pre-existing floor
              stock. Turn off once that migration is complete.
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
            <div className="text-sm font-medium">Automatic inbound (from Rack)</div>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Same as above, but for pallets already sitting on a rack that
              were never scanned in. Applies when moving Rack \u2192 Floor or
              Rack \u2192 Rack. Turn off once existing rack stock is migrated.
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
              Lets staff record an outbound scan for a cell that was never
              stock-counted at all (no exact pallet, no default stock).
              Logged in History as &quot;Default Outbound&quot; and does not
              affect any stock numbers, since there&apos;s nothing tracked to
              reduce.
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
      <div className="text-sm font-medium">Allow default picking and moving</div>
      <p className="text-xs text-zinc-500 mt-1 max-w-sm">
        Lets staff identify and pick pre-existing rack stock (never entered
        into the system) by scanning its carton barcode or SKU, instead of
        being blocked. Doesn&apos;t reduce the source location&apos;s
        recorded stock, since none was ever tracked there.
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
        Lets Move In (v2) reduce Floor&apos;s recorded total below zero,
        instead of blocking when the requested quantity exceeds what&apos;s
        currently tracked there.
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
    </div>
  );
}