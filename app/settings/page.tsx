import { db } from "@/lib/db";
import { settings } from "@/db/schema";
import { DEFAULT_LEDGER_START_AT } from "@/lib/ledger";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

async function getSettings() {
  const [row] = await db.select().from(settings).limit(1);
  return {
    allowDefaultCodeTransactions: row?.allowDefaultCodeTransactions ?? true,
    automaticInbound: row?.automaticInbound ?? false,
    automaticInboundFromRack: row?.automaticInboundFromRack ?? false,
    allowUntrackedOutbound: row?.allowUntrackedOutbound ?? false,
    allowDefaultPicking: row?.allowDefaultPicking ?? true,
    allowNegativeFloorStock: row?.allowNegativeFloorStock ?? false,
    allowNegativeRackStock: row?.allowNegativeRackStock ?? false,
    // Passed as an ISO string so the client component gets a plain value.
    ledgerStartAt: (row?.ledgerStartAt ?? DEFAULT_LEDGER_START_AT).toISOString(),
    ledgerStartIsDefault: !row?.ledgerStartAt,
  };
}

export default async function SettingsPage() {
  const current = await getSettings();

  return (
    <div className="p-8 max-w-xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">
          System-wide configuration.
        </p>
      </header>

      <SettingsForm initial={current} />
    </div>
  );
}
