"use client";

import { useState } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";
import { useCan } from "@/lib/AccessContext";
import type { ActionKey } from "@/lib/pages";
import { InboundForm } from "./_forms/InboundForm";
import { InitialStockForm } from "./_forms/InitialStockForm";
import { ConfirmInboundForm } from "./_forms/ConfirmInboundForm";
import { ShipForm } from "./_forms/ShipForm";
import { AdjustForm } from "./_forms/AdjustForm";
import { CheckSoForm } from "./_forms/CheckSoForm";
import { CorrectQtyForm } from "./_forms/CorrectQtyForm";
import { AdjustBulkForm } from "./_forms/AdjustBulkForm";

type Tab = "INBOUND" | "SHIP" | "INITIAL_STOCK" | "CONFIRM" | "ADJUST_LOCATION" | "ADJUST_BULK" | "ADJUST_PALLET_QTY" | "CHECK_SO";

export default function ScanForms() {
  const labels = usePageLabels("scan")
  const can = useCan();
  // Each tab is its own permission on /permissions (see lib/pages.ts).
  const allTabs: { key: Tab; label: string; action: ActionKey }[] = [
    { key: "INBOUND", label: labels.th_inbound, action: "scan.inbound" },
    { key: "ADJUST_LOCATION", label: labels.th_adjust, action: "scan.adjustLocation" },
    { key: "ADJUST_BULK", label: labels.th_adjust_bulk, action: "scan.adjustBulk" },
    { key: "ADJUST_PALLET_QTY", label: labels.th_correct, action: "scan.correctQty" },
    // { key: "CHECK_SO", label: labels.th_check_so },
  ];
  const tabs = allTabs.filter((t) => can(t.action));
  const [selected, setTab] = useState<Tab | null>(null);
  // Falls back to the first tab this role may use.
  const tab: Tab | null = tabs.some((t) => t.key === selected) ? selected : tabs[0]?.key ?? null;

  if (!tab) {
    return (
      <div className="border border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
        Your role doesn&apos;t have access to any System Control tabs.
      </div>
    );
  }

  return (
    <div>
        <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.page_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {labels.header_description}
        </p>
      </header>
      <div className="flex gap-1 mb-6 border border-zinc-800 rounded-lg p-1 w-fit">
{tabs.map((t) => (
  <button
    key={t.key}
    onClick={() => setTab(t.key)}
    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
      tab === t.key
        ? "bg-amber-500 text-zinc-950"
        : "text-zinc-400 hover:text-zinc-100"
    }`}
  >
    {t.label}
  </button>
))}
      </div>
{tab === "ADJUST_LOCATION" && <AdjustForm />}
{tab === "INBOUND" && <InboundForm />}
{tab === "SHIP" && <ShipForm />}
{tab === "INITIAL_STOCK" && <InitialStockForm />}
{tab === "CONFIRM" && <ConfirmInboundForm />}
{tab === "CHECK_SO" && <CheckSoForm />}
{tab === "ADJUST_PALLET_QTY" && <CorrectQtyForm />}
{tab === "ADJUST_BULK" && <AdjustBulkForm />}
    </div>
  );
}
