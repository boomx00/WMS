"use client";

import InboundByPersonChart from "./InboundByPersonChart";
import DriverActivityPanel from "./DriverActivityPanel";
import ShippedProductsPanel from "./ShippedProductsPanel";
import SalesOrdersShippedPanel from "./SalesOrdersShippedPanel";
import { usePageLabels } from "@/lib/hooks/usePageLabels";

export default function AnalyticsPage() {
  const labels = usePageLabels("analytics");
  return (
    <div className="p-8">
      <header className="mb-8 max-w-4xl">
        <h1 className="text-2xl font-semibold">{labels.page_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">{labels.header_description}</p>
      </header>

      <div className="space-y-8">
      
        <DriverActivityPanel />
        <SalesOrdersShippedPanel />

        <div className="max-w-4xl space-y-8">
          <ShippedProductsPanel />
          <InboundByPersonChart />
        </div>
      </div>
    </div>
  );
}