import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const bcrypt = await import("bcryptjs");
  const { db } = await import("../lib/db");
  const { roles, users } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");

  console.log("Seeding roles...");

  const roleData = [
    { name: "Admin" },
    { name: "Inbound" },
    { name: "Forklift Driver" },
  ];

  await db.insert(roles).values(roleData).onConflictDoNothing({ target: roles.name });

  // Fetch back the roles so we have their real ids (works whether they were
  // just inserted, or already existed from a previous run).
  const allRoles = await db.select().from(roles);
  const roleByName = new Map(allRoles.map((r) => [r.name, r.id]));

  console.log(`Roles ready: ${allRoles.map((r) => r.name).join(", ")}`);

  console.log("Seeding users...");

  // Edit this list with your real staff — username/password/role.
  const userData = [
    { username: "kev", password: "1", roleName: "Admin" },
    { username: "qin", password: "1", roleName: "Inbound" },
    { username: "tes", password: "1", roleName: "Forklift Driver" },
  ];

  let inserted = 0;
  for (const u of userData) {
    const roleId = roleByName.get(u.roleName);
    if (!roleId) {
      console.warn(`Skipping ${u.username} — role "${u.roleName}" not found`);
      continue;
    }

    const [existing] = await db.select().from(users).where(eq(users.username, u.username));
    if (existing) {
      console.log(`Skipping ${u.username} — already exists`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, 10);
    await db.insert(users).values({
      username: u.username,
      passwordHash,
      roleId,
    });
    inserted++;
    console.log(`Created user: ${u.username} (${u.roleName})`);
  }

  console.log(`Done. Inserted ${inserted} new user(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});