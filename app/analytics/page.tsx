import InboundByPersonChart from "./InboundByPersonChart";

export default function AnalyticsPage() {
  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Warehouse activity breakdowns.
        </p>
      </header>

      <InboundByPersonChart />
    </div>
  );
}