"use client";

import type { ReactNode } from "react";
import { usePageLabels } from "@/lib/hooks/usePageLabels";

export default function InventoryClient({
  totalPallets,
  totalUnits,
  onFloor,
  onRack,
  map,
}: {
  totalPallets: number;
  totalUnits: number;
  onFloor: number;
  onRack: number;
  // Rendered by the server page and passed in, so WarehouseMap keeps
  // working even if it's a server component that fetches its own data.
  map: ReactNode;
}) {
  const labels = usePageLabels("heatmap_page");

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.inventory_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">{labels.header_description}</p>
      </header>

      {/* <div className="max-w-6xl">
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label={labels.stat_active_pallets} value={totalPallets.toString()} />
          <StatCard label={labels.stat_total_units} value={totalUnits.toLocaleString("en-US")} />
          <StatCard label={labels.stat_on_floor} value={onFloor.toString()} />
          <StatCard label={labels.stat_racked} value={onRack.toString()} />
        </div>
      </div> */}

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-4">{labels.warehouse_map}</h2>
        {map}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg px-5 py-4 bg-zinc-900/30">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-mono mt-1">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div>

    </div>
    // <div className="border border-dashed border-zinc-800 rounded-lg px-8 py-16 text-center">
    //   <p className="text-zinc-400">No active pallets in the warehouse.</p>
    //   <p className="text-zinc-600 text-sm mt-1">
    //     Scan a product label in from Postman (or the PDA app later) to see it
    //     here.
    //   </p>
    // </div>
  );
}