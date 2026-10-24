"use client";

import { usePageLabels } from "@/lib/hooks/usePageLabels";
import CreateLocationForm from "./CreateLocationForm";
import LocationLookup from "./LocationLookup";

type SpecialLocation = {
  id: number;
  code: string;
  type: string;
};

export default function LocationsView({
  specialLocations,
}: {
  specialLocations: SpecialLocation[];
}) {
  const labels = usePageLabels("locations_master");

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">{labels.page_header}</h1>
        <p className="text-zinc-500 text-sm mt-1">{labels.header_description}</p>
      </header>

      <section className="mb-10">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">
          {labels.section_lookup}
        </h2>
        <LocationLookup />
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">
          {labels.section_add}
        </h2>
        <CreateLocationForm />
      </section>

      <section>
        <h2 className="text-sm font-medium text-zinc-400 mb-3">
          {labels.section_special}
        </h2>
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-500 text-left">
                <th className="px-4 py-3 font-medium">{labels.th_code}</th>
                <th className="px-4 py-3 font-medium">{labels.th_type}</th>
              </tr>
            </thead>
            <tbody>
              {specialLocations.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-zinc-600">
                    {labels.empty}
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