import { db } from "@/lib/db";
import { settings } from "@/db/schema";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

async function getSettings() {
  const [row] = await db.select().from(settings).limit(1);
  return (
    row ?? {
      id: 0,
      allowDefaultCodeTransactions: true,
      automaticInbound: false,
      automaticInboundFromRack: false,
      allowUntrackedOutbound: false,
    }
  );
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