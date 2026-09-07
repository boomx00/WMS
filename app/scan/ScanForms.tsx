"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageLabels } from "@/lib/hooks/usePageLabels";

function parseLabel(raw: string) {
  const parts = raw.trim().split("*");
  if (parts.length !== 4) return null;
  const [sku, palletSeq, qty, workOrderNumber] = parts;
  const quantity = Number(qty);
  if (!sku || !palletSeq || Number.isNaN(quantity) || !workOrderNumber) return null;
  return { sku, palletSeq, quantity, workOrderNumber };
}
type Tab = "INBOUND" | "SHIP" | "INITIAL_STOCK" | "CONFIRM" | "ADJUST_LOCATION" | "ADJUST_BULK" | "ADJUST_PALLET_QTY" | "CHECK_SO";
export default function ScanForms() {
  const [tab, setTab] = useState<Tab>("INBOUND");
  const labels = usePageLabels("scan")
  const tabs: { key: Tab; label: string }[] = [
    { key: "INBOUND", label: labels.th_inbound },
    { key: "ADJUST_LOCATION", label: labels.th_adjust},
      { key: "ADJUST_BULK", label: labels.th_adjust_bulk },

    { key: "ADJUST_PALLET_QTY", label: labels.th_correct },
    // { key: "CHECK_SO", label: labels.th_check_so },
  ];
  return (
    <div>
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

function FeedbackBox({ error, success }: { error: string | null; success: string | null }) {
  if (error) {
    return (
      <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mt-4">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mt-4">
        {success}
      </p>
    );
  }
  return null;
}

function InboundForm() {
  const router = useRouter();
  const [labelInput, setLabelInput] = useState("");
  const [sku, setSku] = useState("");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Best-effort auto-fill — parses the standard SKU*seq*qty*WO format if it
  // matches, but never blocks submission if it doesn't. Every field below
  // stays manually editable regardless.
  function handleLabelChange(value: string) {
    setLabelInput(value);
    setError(null);
    setSuccess(null);

    const cleaned = value.trim().replace(/^\*+/, "");
    const parts = cleaned.split("*");
    if (parts.length === 4) {
      const [parsedSku, , , parsedWo] = parts;
      if (parsedSku) setSku(parsedSku);
      if (parsedWo) setWorkOrderNumber(parsedWo);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!labelInput || !sku || !workOrderNumber || !quantity) {
      setError("Label, SKU, work order, and quantity are all required.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/pallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: labelInput.trim(),
        sku: sku.trim(),
        workOrderNumber: workOrderNumber.trim(),
        quantity: Number(quantity),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to scan pallet in");
      return;
    }

    setSuccess(`Pallet ${labelInput.trim()} scanned in at Floor.`);
    setLabelInput("");
    setSku("");
    setWorkOrderNumber("");
    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan product label</label>
        <input
          type="text"
          value={labelInput}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="*14013024102*0021*5000*M0006995"
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">SKU</label>
          <input
            type="text"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Work Order</label>
          <input
            type="text"
            value={workOrderNumber}
            onChange={(e) => setWorkOrderNumber(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quantity</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !labelInput || !sku || !workOrderNumber || !quantity}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Scanning in..." : "Scan in at Floor"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}

function MoveForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [currentLocationCode, setCurrentLocationCode] = useState("");
  const [newLocationCode, setNewLocationCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [needsQuantity, setNeedsQuantity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        currentLocationCode: currentLocationCode.trim(),
        newLocationCode: newLocationCode.trim(),
        quantity: quantity ? Number(quantity) : undefined,
      }),
    });
    setLoading(false);

    const data = await res.json();

    if (!res.ok) {
  if (data.matchType === "default_needs_quantity") {
    setNeedsQuantity(true);
    setError(`${data.error} (${data.availableQuantity} available)`);
  } else if (data.matchType === "auto_inbound_needs_quantity") {
    setNeedsQuantity(true);
    setError(data.error);
  } else {
    setError(data.error ?? "Failed to move pallet");
  }
  return;
}

    setSuccess(
      data.matchType === "default_fallback"
        ? `Moved ${data.quantityMoved} units of default stock to ${newLocationCode.trim()}.`
        : `Pallet moved to ${newLocationCode.trim()}.`
    );
    setLabel("");
    setCurrentLocationCode("");
    setNewLocationCode("");
    setQuantity("");
    setNeedsQuantity(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan current location</label>
        <input
          type="text"
          value={currentLocationCode}
          onChange={(e) => setCurrentLocationCode(e.target.value)}
          placeholder="A.1.1"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan destination location</label>
        <input
          type="text"
          value={newLocationCode}
          onChange={(e) => setNewLocationCode(e.target.value)}
          placeholder="A.1.2"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      {needsQuantity && (
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Quantity (this is default stock, not an individually tracked pallet)
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-amber-700 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !label || !currentLocationCode || !newLocationCode}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Moving..." : "Move pallet"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}



function SplitForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [splitQuantity, setSplitQuantity] = useState("");
  const [newLocationCode, setNewLocationCode] = useState("LEFTOVER");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        splitQuantity: Number(splitQuantity),
        newLocationCode: newLocationCode.trim(),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to split pallet");
      return;
    }

    const data = await res.json();
    setSuccess(`Split ${splitQuantity} units to ${newLocationCode} as ${data.split.label}`);
    setLabel("");
    setSplitQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan/enter original pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="14013024102*0021*5000*M0006995"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quantity to split off</label>
        <input
          type="number"
          min={1}
          value={splitQuantity}
          onChange={(e) => setSplitQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Destination</label>
        <select
          value={newLocationCode}
          onChange={(e) => setNewLocationCode(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="LEFTOVER">Leftover</option>
          <option value="DESTROY">Destroy</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading || !label || !splitQuantity}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Splitting..." : "Split pallet"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}

function InitialStockForm() {
  const router = useRouter();
  const [defaultCode, setDefaultCode] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/initial-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultCode: defaultCode.trim(),
        locationCode: locationCode.trim(),
        quantity: Number(quantity),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to record initial stock");
      return;
    }

    setSuccess(`Recorded ${quantity} units at ${locationCode.trim()}.`);
    setDefaultCode("");
    setLocationCode("");
    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        For stock that already existed before scanning was in place. Uses the
        item&apos;s default code instead of a real pallet label.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Default code</label>
        <input
          type="text"
          value={defaultCode}
          onChange={(e) => setDefaultCode(e.target.value)}
          placeholder="14013024102*default"
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Location</label>
        <input
          type="text"
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          placeholder="A.1.1"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quantity in this cell</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !defaultCode || !locationCode || !quantity}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Recording..." : "Record stock"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}

function ConfirmInboundForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/confirm-inbound", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim(), locationCode: locationCode.trim() }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to confirm inbound");
      return;
    }

    setSuccess(`Confirmed ${label.trim()} at ${locationCode.trim()}. Now active stock.`);
    setLabel("");
    setLocationCode("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        Scan a pending pallet's printed label, then scan where you actually
        placed it, to confirm it as real stock.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pending pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan actual location</label>
        <input
          type="text"
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          placeholder="LEFTOVER, DESTROY, or A.1.1"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !label || !locationCode}
        className="px-4 py-2 rounded-md bg-emerald-600 text-zinc-100 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
      >
        {loading ? "Confirming..." : "Confirm Inbound"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}
function ToOutboundForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [currentLocationCode, setCurrentLocationCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [needsQuantity, setNeedsQuantity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        currentLocationCode: currentLocationCode.trim(),
        newLocationCode: "OUTBOUND_WH",
        quantity: quantity ? Number(quantity) : undefined,
      }),
    });
    setLoading(false);

    const data = await res.json();

    if (!res.ok) {
      if (data.matchType === "default_needs_quantity" || data.matchType === "auto_inbound_needs_quantity") {
        setNeedsQuantity(true);
        setError(data.availableQuantity ? `${data.error} (${data.availableQuantity} available)` : data.error);
      } else {
        setError(data.error ?? "Failed to move to Outbound Warehouse");
      }
      return;
    }

    setSuccess(`Moved ${label.trim()} to Outbound Warehouse.`);
    setLabel("");
    setCurrentLocationCode("");
    setQuantity("");
    setNeedsQuantity(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan current location</label>
        <input
          type="text"
          value={currentLocationCode}
          onChange={(e) => setCurrentLocationCode(e.target.value)}
          placeholder="A.1.1 or FLOOR"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      {needsQuantity && (
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-amber-700 text-sm font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !label || !currentLocationCode}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Moving..." : "Move to Outbound"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}

function ShipForm() {
  const router = useRouter();
  const [soNumber, setSoNumber] = useState("");
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/ship", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soNumber: soNumber.trim(),
        label: label.trim(),
        quantity: Number(quantity),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to ship pallet");
      return;
    }

    const data = await res.json();
    setSuccess(`Shipped ${quantity} units. ${data.remainingOnOrder} remaining on ${soNumber.trim()} for this item.`);
    setLabel("");
    setQuantity("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        Scan the sales order barcode, then the pallet in Outbound Warehouse,
        then enter the quantity per the picking list.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan sales order barcode</label>
        <input
          type="text"
          value={soNumber}
          onChange={(e) => setSoNumber(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Quantity per picking list</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !soNumber || !label || !quantity}
        className="px-4 py-2 rounded-md bg-red-600 text-zinc-100 text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
      >
        {loading ? "Shipping..." : "Confirm Ship"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}

function AdjustForm() {
  const router = useRouter();
  const [locationCode, setLocationCode] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/location-stock/adjust", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationCode: locationCode.trim(),
        itemSku: itemSku.trim(),
        newQuantity: Number(newQuantity),
        reason: reason.trim(),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to adjust quantity");
      return;
    }

    const data = await res.json();
    const sign = data.delta > 0 ? "+" : "";
    setSuccess(`Adjusted ${itemSku.trim()} at ${locationCode.trim()}: ${data.previousQuantity} → ${data.newQuantity} (${sign}${data.delta})`);
    setLocationCode("");
    setItemSku("");
    setNewQuantity("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        Directly correct the recorded quantity of a SKU at a location —
        for stock-count discrepancies or data entry mistakes. Logged as an
        ADJUSTMENT event.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Location</label>
        <input
          type="text"
          value={locationCode}
          onChange={(e) => setLocationCode(e.target.value)}
          placeholder="A.1.1"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">SKU</label>
        <input
          type="text"
          value={itemSku}
          onChange={(e) => setItemSku(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Corrected quantity</label>
        <input
          type="number"
          min={0}
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Reason (optional)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Physical recount, data entry error"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !locationCode || !itemSku || newQuantity === ""}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Adjusting..." : "Apply Adjustment"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}

function CheckSoForm() {
  const [soNumber, setSoNumber] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    const res = await fetch(`/api/sales-orders/lookup?soNumber=${encodeURIComponent(soNumber.trim())}`);
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to look up sales order");
      return;
    }

    setResult(await res.json());
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={soNumber}
          onChange={(e) => setSoNumber(e.target.value)}
          placeholder="Scan or type SO number"
          autoFocus
          className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={loading || !soNumber}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Checking..." : "Check"}
        </button>
      </form>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div>
          <div className="text-sm mb-3">
            <span className="font-mono text-amber-500">{result.soNumber}</span>{" "}
            <span className="text-zinc-500">{new Date(result.orderDate).toLocaleDateString()}</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-zinc-500 text-left border-t border-zinc-800 pt-2">
                <th className="py-2 font-medium">SKU</th>
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium text-right">Ordered</th>
                <th className="py-2 font-medium text-right">Shipped</th>
                <th className="py-2 font-medium text-right">Remaining</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((line: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800/60">
                  <td className="py-1.5 font-mono text-zinc-300">{line.itemSku}</td>
                  <td className="py-1.5 text-zinc-500">{line.itemName}</td>
                  <td className="py-1.5 text-right font-mono">{line.quantity.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-mono">{line.shipped.toLocaleString()}</td>
                  <td className="py-1.5 text-right font-mono">{line.remaining.toLocaleString()}</td>
                  <td className="py-1.5">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        line.status === "SHIPPED"
                          ? "bg-emerald-950 text-emerald-300"
                          : line.status === "PICKING"
                          ? "bg-amber-950 text-amber-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {line.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CorrectQtyForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const res = await fetch("/api/pallets/correct-quantity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        newQuantity: Number(newQuantity),
        reason: reason.trim(),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to correct quantity");
      return;
    }

    const data = await res.json();
    const sign = data.delta > 0 ? "+" : "";
    setSuccess(`Corrected ${label.trim()}: ${data.previousQuantity} → ${data.quantity} (${sign}${data.delta})`);
    setLabel("");
    setNewQuantity("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
      <p className="text-xs text-zinc-500">
        Correct a specific pallet&apos;s recorded quantity — for fixing a
        mistaken entry made during Inbound (label, MO, and qty are tracked
        together). Keeps Location Stock in sync automatically.
      </p>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Scan pallet label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Corrected quantity</label>
        <input
          type="number"
          min={0}
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1">Reason (optional)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Mistyped quantity during Inbound"
          className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !label || newQuantity === ""}
        className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {loading ? "Correcting..." : "Correct Quantity"}
      </button>

      <FeedbackBox error={error} success={success} />
    </form>
  );
}

type BulkAdjustment = {
  id: number;
  adjustmentCode: string;
  source: "SCAN" | "STOCK_OPNAME";
  description: string | null;
  opnameNumber: string | null;
  lineCount: number;
  createdAt: string;
  username: string | null;
};

type BulkAdjustmentLine = {
  locationCode: string;
  itemSku: string;
  itemName: string | null;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
};

function AdjustBulkForm() {
  const router = useRouter();
  const [rows, setRows] = useState([{ locationCode: "", itemSku: "", newQuantity: "" }]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ adjustmentCode: string; appliedCount: number; skippedCount: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const [adjustments, setAdjustments] = useState<BulkAdjustment[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [linesById, setLinesById] = useState<Record<number, BulkAdjustmentLine[]>>({});
  const [linesLoadingId, setLinesLoadingId] = useState<number | null>(null);

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!linesById[id]) {
      setLinesLoadingId(id);
      const res = await fetch(`/api/bulk-adjustments/${id}`);
      if (res.ok) {
        const data = await res.json();
        setLinesById((prev) => ({ ...prev, [id]: data.lines }));
      }
      setLinesLoadingId(null);
    }
  }
  async function refreshList() {
    setListLoading(true);
    const res = await fetch("/api/bulk-adjustments");
    if (res.ok) setAdjustments(await res.json());
    setListLoading(false);
  }

  useEffect(() => {
    refreshList();
  }, []);

  function updateRow(index: number, field: "locationCode" | "itemSku" | "newQuantity", value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { locationCode: "", itemSku: "", newQuantity: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const lines = rows
      .map((r) => ({
        locationCode: r.locationCode.trim(),
        itemSku: r.itemSku.trim(),
        newQuantity: Number(r.newQuantity),
      }))
      .filter((r) => r.locationCode || r.itemSku || r.newQuantity);

    if (lines.length === 0) {
      setError("Add at least one row");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/bulk-adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, description: description.trim() }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to apply bulk adjustment");
      return;
    }

    const data = await res.json();
    setResult({ adjustmentCode: data.adjustmentCode, appliedCount: data.appliedCount, skippedCount: data.skippedCount });
    setRows([{ locationCode: "", itemSku: "", newQuantity: "" }]);
    setDescription("");
    router.refresh();
    await refreshList();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/30 space-y-4">
        <p className="text-xs text-zinc-500">
          Directly set the stock quantity for multiple location + SKU pairs at once.
          Each row&apos;s existing stock is removed and replaced with the value you
          enter. The whole batch is logged together under one Adjustment ID.
        </p>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={row.locationCode}
                onChange={(e) => updateRow(i, "locationCode", e.target.value)}
                placeholder="Location"
                className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                value={row.itemSku}
                onChange={(e) => updateRow(i, "itemSku", e.target.value)}
                placeholder="SKU"
                className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                value={row.newQuantity}
                onChange={(e) => updateRow(i, "newQuantity", e.target.value)}
                placeholder="Qty"
                min={0}
                className="w-28 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm font-mono focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                className="text-zinc-600 hover:text-red-400 disabled:opacity-30 text-sm px-2"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="text-xs text-amber-500 hover:text-amber-400">
          + Add row
        </button>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-md bg-amber-500 text-zinc-950 text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {loading ? "Applying..." : "Apply Bulk Adjustment"}
        </button>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mt-4">{error}</p>
        )}
        {result && (
          <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mt-4">
            Adjustment <span className="font-mono">{result.adjustmentCode}</span> applied — {result.appliedCount} line(s)
            changed, {result.skippedCount} already matched.
          </p>
        )}
      </form>

           <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Bulk Adjustments</h3>
          {listLoading && <span className="text-xs text-zinc-600">Loading...</span>}
        </div>
        {adjustments.length === 0 ? (
          <div className="px-4 py-6 text-center text-zinc-600 text-sm">No bulk adjustments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 text-xs border-b border-zinc-800">
                <th className="py-2 px-4"></th>
                <th className="py-2 px-4">ID</th>
                <th className="py-2 px-4">Source</th>
                <th className="py-2 px-4">Description</th>
                <th className="py-2 px-4 text-right">Lines</th>
                <th className="py-2 px-4">By</th>
                <th className="py-2 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <>
                  <tr
                    key={a.id}
                    onClick={() => toggleExpand(a.id)}
                    className="border-b border-zinc-900 last:border-0 cursor-pointer hover:bg-zinc-900/60"
                  >
                    <td className="py-2 px-4 text-zinc-600 text-xs w-6">
                      <span className={`inline-block transition-transform ${expandedId === a.id ? "rotate-90" : ""}`}>▶</span>
                    </td>
                    <td className="py-2 px-4 font-mono text-amber-500">{a.adjustmentCode}</td>
                    <td className="py-2 px-4 text-zinc-400">
                      {a.source === "STOCK_OPNAME" ? `Stock Opname${a.opnameNumber ? ` (${a.opnameNumber})` : ""}` : "Scan"}
                    </td>
                    <td className="py-2 px-4 text-zinc-400">{a.description || "—"}</td>
                    <td className="py-2 px-4 text-right font-mono">{a.lineCount}</td>
                    <td className="py-2 px-4 text-zinc-500">{a.username ?? "—"}</td>
                    <td className="py-2 px-4 text-zinc-500">{new Date(a.createdAt).toLocaleString()}</td>
                  </tr>
                  {expandedId === a.id && (
                    <tr key={`${a.id}-detail`} className="border-b border-zinc-900 last:border-0">
                      <td colSpan={7} className="px-4 py-3 bg-zinc-950/50">
                        {linesLoadingId === a.id ? (
                          <p className="text-xs text-zinc-600">Loading details...</p>
                        ) : !linesById[a.id] || linesById[a.id].length === 0 ? (
                          <p className="text-xs text-zinc-600">No lines were changed in this adjustment.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-zinc-600 border-b border-zinc-800">
                                <th className="py-1.5 pr-4">Location</th>
                                <th className="py-1.5 pr-4">SKU</th>
                                <th className="py-1.5 pr-4">Product</th>
                                <th className="py-1.5 pr-4 text-right">Previous</th>
                                <th className="py-1.5 pr-4 text-right">New</th>
                                <th className="py-1.5 pr-4 text-right">Delta</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linesById[a.id].map((l, i) => (
                                <tr key={i} className="border-b border-zinc-900 last:border-0">
                                  <td className="py-1.5 pr-4 font-mono text-zinc-300">{l.locationCode}</td>
                                  <td className="py-1.5 pr-4 font-mono text-zinc-300">{l.itemSku}</td>
                                  <td className="py-1.5 pr-4 text-zinc-500">{l.itemName ?? "—"}</td>
                                  <td className="py-1.5 pr-4 text-right font-mono text-zinc-400">{l.previousQuantity.toLocaleString()}</td>
                                  <td className="py-1.5 pr-4 text-right font-mono text-zinc-300">{l.newQuantity.toLocaleString()}</td>
                                  <td className={`py-1.5 pr-4 text-right font-mono ${l.delta > 0 ? "text-amber-400" : "text-red-400"}`}>
                                    {l.delta > 0 ? "+" : ""}
                                    {l.delta.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}