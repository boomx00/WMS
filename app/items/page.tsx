import { db } from "@/lib/db";
import { items } from "@/db/schema";
import { sessionIsSuper } from "@/lib/auth";
import ItemsClient from "./ItemsClient";

export const dynamic = "force-dynamic";

async function getItems() {
  return db.select().from(items).orderBy(items.sku);
}


export default async function ItemsPage() {
  const [itemRows, isAdmin] = await Promise.all([getItems(), sessionIsSuper()]);

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Items</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Product master data.{" "}
          {!isAdmin && <span className="text-zinc-600">Read-only — only Manager can edit.</span>}
        </p>
      </header>

      <ItemsClient items={itemRows} isAdmin={isAdmin} />
    </div>
  );
}