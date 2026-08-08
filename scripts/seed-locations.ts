import { config } from "dotenv";
config({ path: ".env.local" });

const AREA_WIDTHS: Record<string, number> = {
  A: 13,
  B: 16,
  C: 15,
  D: 16,
  E: 15,
  F: 16,
  G: 15,
  H: 16,
};

async function main() {
  // Dynamic import — runs here, after config() has already set DATABASE_URL,
  // unlike a static top-level import which would get hoisted above config().
  const { db } = await import("../lib/db");
  const { locations } = await import("../db/schema");

  console.log("Seeding rack locations...");

  const rackRows = Object.entries(AREA_WIDTHS).flatMap(([area, maxX]) => {
    const rows = [];
    for (let x = 1; x <= maxX; x++) {
      for (let y = 1; y <= 5; y++) {
        rows.push({
          code: `${area}.${x}.${y}`,
          type: "RACK" as const,
          area,
          x,
          y,
        });
      }
    }
    return rows;
  });

  console.log(`Generated ${rackRows.length} rack locations.`);

  await db.insert(locations).values(rackRows).onConflictDoNothing({
    target: locations.code,
  });

  await db
    .insert(locations)
    .values([
      { code: "FLOOR", type: "FLOOR" },
      { code: "DESTROY", type: "DESTROY" },
      { code: "LEFTOVER", type: "LEFTOVER" },
    ])
    .onConflictDoNothing({ target: locations.code });

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});