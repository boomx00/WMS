import InboundByPersonChart from "./InboundByPersonChart";
import DriverActivityPanel from "./DriverActivityPanel";
import ShippedProductsPanel from "./ShippedProductsPanel";

export default function AnalyticsPage() {
  return (
    <div className="p-8">
      <header className="mb-8 max-w-4xl">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Warehouse activity breakdowns.
        </p>
      </header>

      <div className="space-y-8">
        {/* Not wrapped in max-w-4xl — its expanded detail view uses the
            full width of the main content area (up to the sidebar). */}
        <DriverActivityPanel />

        <div className="max-w-4xl space-y-8">
          <ShippedProductsPanel />
          <InboundByPersonChart />
        </div>
      </div>
    </div>
  );
}