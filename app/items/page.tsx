import { db } from "@/lib/db";
import { items, users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import ItemsClient from "./ItemsClient";

export const dynamic = "force-dynamic";

async function getItems() {
  return db.select().from(items).orderBy(items.sku);
}

async function getIsAdmin(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const [row] = await db
    .select({ roleName: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, session.userId));

  return row?.roleName?.toLowerCase() === "admin";
}

export default async function ItemsPage() {
  const [itemRows, isAdmin] = await Promise.all([getItems(), getIsAdmin()]);

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Items</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Product master data.{" "}
          {!isAdmin && <span className="text-zinc-600">Read-only — only admins can edit.</span>}
        </p>
      </header>

      <ItemsClient items={itemRows} isAdmin={isAdmin} />
    </div>
  );
}