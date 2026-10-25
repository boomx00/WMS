import OtherTransactionsClient from "./OtherTransactionsClient";

export const dynamic = "force-dynamic";

export default function OtherTransactionsPage() {
  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Other Transactions</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Manual stock corrections outside the normal flow — e.g. defective
          product found mid-process.
        </p>
      </header>
      <OtherTransactionsClient />
    </div>
  );
}