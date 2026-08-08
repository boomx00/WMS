import ScanForms from "./ScanForms";

export default function ScanPage() {
  return (
    <div className="p-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Scan</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Inbound, move, or remove a pallet. Mirrors the PDA scan flow.
        </p>
      </header>

      <ScanForms />
    </div>
  );
}