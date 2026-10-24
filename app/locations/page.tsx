import { db } from "@/lib/db";
import { locations } from "@/db/schema";
import { eq, ne, sql } from "drizzle-orm";
import LocationsView from "./LocationsView";

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

  return <LocationsView specialLocations={specialLocations} />;
}