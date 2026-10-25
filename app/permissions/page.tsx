import { db } from "@/lib/db";
import { roles, rolePagePermissions, roleActionPermissions, rolePdaPermissions } from "@/db/schema";
import { isSuperRoleName, SUPER_ROLE_NAME } from "@/lib/roles";
import { APP_ACTIONS, GRANTABLE_PAGES, isActionKey, isGrantablePath } from "@/lib/pages";
import { PDA_FEATURES, PDA_MENUS, isPdaKey } from "@/lib/pdaFeatures";
import PermissionsClient from "./PermissionsClient";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const [roleRows, pageRows, actionRows, pdaRows] = await Promise.all([
    db.select().from(roles).orderBy(roles.name),
    db
      .select({ roleId: rolePagePermissions.roleId, pagePath: rolePagePermissions.pagePath })
      .from(rolePagePermissions),
    db
      .select({ roleId: roleActionPermissions.roleId, actionKey: roleActionPermissions.actionKey })
      .from(roleActionPermissions),
    db
      .select({ roleId: rolePdaPermissions.roleId, pdaKey: rolePdaPermissions.pdaKey })
      .from(rolePdaPermissions),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Permissions</h1>
        <p className="text-zinc-500 text-sm mt-1">
          What each role can open and do, on the web app and on the PDA.{" "}
          {SUPER_ROLE_NAME} always has everything, and is the only role that can
          manage Users, Roles and Permissions.
        </p>
      </header>

      <PermissionsClient
        roles={roleRows.map((r) => ({ id: r.id, name: r.name, isSuper: isSuperRoleName(r.name) }))}
        pages={GRANTABLE_PAGES.map((p) => ({ path: p.path, label: p.label }))}
        actions={APP_ACTIONS.map((a) => ({ key: a.key, page: a.page, label: a.label, hint: a.hint ?? null }))}
        pdaMenus={PDA_MENUS.map((m) => ({ key: m.key, label: m.label }))}
        pdaFeatures={PDA_FEATURES.map((f) => ({ key: f.key, menu: f.menu, label: f.label, hint: f.hint ?? null }))}
        initialPageGrants={pageRows.filter((g) => isGrantablePath(g.pagePath))}
        initialActionGrants={actionRows.filter((g) => isActionKey(g.actionKey))}
        initialPdaGrants={pdaRows.filter((g) => isPdaKey(g.pdaKey))}
      />
    </div>
  );
}
