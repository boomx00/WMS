import { db } from "@/lib/db";
import { settings } from "@/db/schema";
import { DEFAULT_LEDGER_START_AT } from "@/lib/ledger";
import { getPurposeLocations } from "@/lib/locationRules";
import { getWarehouses } from "@/lib/warehouses";
import type { WarehouseDefaults } from "./DefaultLocationsSetting";
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
    markingEnabled: row?.markingEnabled ?? true,
  };
}

// Each warehouse, its PDA-picker defaults, and the locations of that
// warehouse each default can be chosen from.
async function getWarehouseDefaults(): Promise<WarehouseDefaults[]> {
  const [all, receiving, staging] = await Promise.all([
    getWarehouses(db),
    getPurposeLocations(db, "receiving"),
    getPurposeLocations(db, "staging"),
  ]);
  const option = (l: { id: number; code: string }) => ({ id: l.id, code: l.code });
  return all.map((w) => ({
    id: w.id,
    name: w.name,
    isActive: w.isActive,
    defaultReceivingLocationId: w.defaultReceivingLocationId,
    defaultStagingLocationId: w.defaultStagingLocationId,
    receiving: receiving.filter((l) => l.warehouseId === w.id).map(option),
    staging: staging.filter((l) => l.warehouseId === w.id).map(option),
  }));
}

export default async function SettingsPage() {
  const [current, warehouses] = await Promise.all([getSettings(), getWarehouseDefaults()]);

  return (
    <div className="p-8 max-w-2xl">
      

      <SettingsForm initial={current} warehouses={warehouses} />
    </div>
  );
}
