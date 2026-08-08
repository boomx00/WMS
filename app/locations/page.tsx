import { db } from "@/lib/db";
import { locations } from "@/db/schema";
import { eq, ne, sql } from "drizzle-orm";
import CreateLocationForm from "./CreateLocationForm";
import LocationLookup from "./LocationLookup";

export const dynamic = "force-dynamic";

async function getSpecialLocations() {
  return db.select().from(locations).where(ne(locations.type, "RACK"));
}

async function getRackCount() {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(locations)
    .where(eq(locations.type, "RACK"));
  return row.count;
}

export default async function LocationsPage() {
  const [specialLocations, rackCount] = await Promise.all([
    getSpecialLocations(),
    getRackCount(),
  ]);

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Locations</h1>
        <p className="text-zinc-500 text-sm mt-1">
  {rackCount.toLocaleString()} rack locations seeded — see the{" "}
  <a href="/" className="text-amber-500 hover:underline">
    Warehouse Map
  </a>{" "}
  on the dashboard for the full layout, or{" "}
  <a href="/locations/print" className="text-amber-500 hover:underline">
    print a location label
  </a>
  .
</p>
      </header>

      <section className="mb-10">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">
          Look up a location
        </h2>
        <LocationLookup />
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">
          Add a location
        </h2>
        <CreateLocationForm />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-400 mb-3">
          Special locations
        </h2>
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-500 text-left">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {specialLocations.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-zinc-600">
                    None yet.
                  </td>
                </tr>
              ) : (
                specialLocations.map((loc) => (
                  <tr
                    key={loc.id}
                    className="border-t border-zinc-800 hover:bg-zinc-900/50"
                  >
                    <td className="px-4 py-3 font-mono text-amber-500">
                      {loc.code}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{loc.type}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}