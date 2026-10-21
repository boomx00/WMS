import { config } from "dotenv";
config({ path: ".env.local" });

// FULL WIPE + MASTER USER.
// Empties EVERY table in the database (stock, ledger, pallets, sales orders,
// Tambahan, opname, items, locations, settings, page labels, users, roles,
// permissions — including tables that only exist on the live DB), resets
// all id counters, then creates:
//   role  "Manager" (the super role — has every page, action and PDA feature)
//   user  kev / 1
//
// This can't be undone. Back up first if there's anything you might want:
//   docker exec wms-db pg_dump -U postgres wms_v2 > wms_v2-backup.sql
//
// Run:  npx tsx scripts/seed-master.ts --confirm

const MASTER_USERNAME = "kev";
const MASTER_PASSWORD = "1";

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error("This deletes EVERYTHING in the database. Re-run with --confirm to go ahead.");
    process.exit(1);
  }

  const bcrypt = await import("bcryptjs");
  const { db } = await import("../lib/db");
  const { roles, users } = await import("../db/schema");
  const { SUPER_ROLE_NAME } = await import("../lib/roles");
  const { sql } = await import("drizzle-orm");

  const dbName = new URL(process.env.DATABASE_URL!).pathname.replace(/^\//, "");
  console.log(`Wiping database "${dbName}"...`);

  // Every table in the public schema, read from Postgres itself rather than
  // db/schema.ts, so live-only tables get wiped too.
  const tableRows = (await db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  )) as unknown as { tablename: string }[];
  const tableNames = tableRows.map((r) => r.tablename);

  if (tableNames.length === 0) {
    console.error("No tables found — is DATABASE_URL pointing at the right database?");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(MASTER_PASSWORD, 10);

  // One transaction: if anything fails, nothing is deleted.
  await db.transaction(async (tx) => {
    const quoted = tableNames.map((t) => `"public"."${t.replace(/"/g, '""')}"`).join(", ");
    await tx.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));

    const [role] = await tx.insert(roles).values({ name: SUPER_ROLE_NAME }).returning();
    await tx.insert(users).values({ username: MASTER_USERNAME, passwordHash, roleId: role.id });
  });

  console.log(`Emptied ${tableNames.length} table(s): ${tableNames.join(", ")}`);
  console.log(`Created role "${SUPER_ROLE_NAME}" and user "${MASTER_USERNAME}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});