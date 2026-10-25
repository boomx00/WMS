import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../lib/db");
  const { items } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  // mci (old code) -> lmi (current items.sku)
  const aliases: [string, string][] = [
    ["5020002001", "0201003000041"],
    ["5020002025", "0201003000047"],
    ["5020002016", "0201003000058"],
    ["5020002002", "0201004000035"],
    ["5020002026", "0201004000040"],
    ["5020002017", "0201004000052"],
    ["5020002003", "0201005000036"],
    ["5020002027", "0201005000042"],
    ["5020002018", "0201005000054"],
    ["5020002004", "0201006000026"],
    ["5022003015", "14012023550"],
    ["5022003017", "14012023650"],
    ["5022003016", "14012024550"],
    ["5022003018", "14012024650"],
    ["5022003019", "14012025550"],
    ["5022003021", "14012025650"],
    ["5022003020", "14012026550"],
    ["5022003022", "14012026650"],
    ["5020002028", "14013023102"],
    ["16744105", "14013023502"],
    ["5020002022", "14013023750"],
    ["5020002031", "14013023801"],
    ["5020002023", "14013024750"],
    ["5020002032", "14013024801"],
    ["5020002024", "14013025750"],
    ["5020002033", "14013025801"],
    ["16387102", "14013026701"],
    ["5020004005", "14013073701"],
    ["5020004006", "14013074701"],
    ["5020004007", "14013075701"],
    ["5020004004", "14013076501"],
  ];

  console.log(`Applying ${aliases.length} legacy code mappings...`);

  let updated = 0;
  const skipped: string[] = [];

  for (const [mci, lmi] of aliases) {
    const [item] = await db.select().from(items).where(eq(items.sku, lmi));
    if (!item) {
      skipped.push(`${mci} -> ${lmi} (no item with sku ${lmi})`);
      continue;
    }
    await db.update(items).set({ legacySku: mci }).where(eq(items.id, item.id));
    updated++;
    console.log(`  ${mci} -> ${lmi} (${item.name})`);
  }

  console.log(`\nUpdated ${updated} items with a legacy code.`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length}:`);
    skipped.forEach((s) => console.log(`  ${s}`));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
