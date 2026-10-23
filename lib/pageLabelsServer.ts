import { db } from "@/lib/db";
import { pageLabels } from "@/db/schema";
import type { LabelOverrides } from "@/lib/language";

// Loads every label override in one query so the root layout can hand them
// to the client up front. usePageLabels resolves from this instead of
// fetching after mount, which is what caused the default-language flash.
export async function getLabelOverrides(): Promise<LabelOverrides> {
  const rows = await db.select().from(pageLabels);

  const result: LabelOverrides = {};
  for (const r of rows) {
    (result[r.page] ??= {})[r.key] = {
      en: r.textEn ?? "",
      id: r.textId ?? "",
      zh: r.textZh ?? "",
    };
  }
  return result;
}