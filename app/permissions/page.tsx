import { db } from "@/lib/db";
import { roles, rolePagePermissions } from "@/db/schema";
import { GRANTABLE_PAGES, isAdminRoleName, isGrantablePath } from "@/lib/pages";
import PermissionsClient from "./PermissionsClient";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const [roleRows, grantRows] = await Promise.all([
    db.select().from(roles).orderBy(roles.name),
    db
      .select({ roleId: rolePagePermissions.roleId, pagePath: rolePagePermissions.pagePath })
      .from(rolePagePermissions),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Permissions</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Which web pages each role can open. Admin always has every page.
          Settings, Users, Roles and Permissions stay admin-only. Changes apply
          on the user&apos;s next page load. A role with no pages can&apos;t log in
          to the web app (PDA is unaffected).
        </p>
      </header>

      <PermissionsClient
        roles={roleRows.map((r) => ({ id: r.id, name: r.name, isAdmin: isAdminRoleName(r.name) }))}
        pages={GRANTABLE_PAGES.map((p) => ({ path: p.path, label: p.label }))}
        initialGrants={grantRows.filter((g) => isGrantablePath(g.pagePath))}
      />
    </div>
  );
}
