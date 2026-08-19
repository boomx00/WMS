import { db } from "@/lib/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import CreateUserForm from "./CreateUserForm";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

async function getUsers() {
  return db
    .select({
      id: users.id,
      username: users.username,
      roleId: users.roleId,
      roleName: roles.name,
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .orderBy(users.username);
}

async function getAllRoles() {
  return db.select().from(roles).orderBy(roles.name);
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

export default async function UsersPage() {
  const [userList, roleList, isAdmin] = await Promise.all([
    getUsers(),
    getAllRoles(),
    getIsAdmin(),
  ]);

  return (
    <div className="p-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {isAdmin ? "Manage warehouse staff accounts and roles." : "Read-only — only admins can change roles."}
        </p>
      </header>

      {isAdmin && (
        <div className="mb-8">
          <CreateUserForm roles={roleList} />
        </div>
      )}

      <UsersClient users={userList} roles={roleList} isAdmin={isAdmin} />
    </div>
  );
}