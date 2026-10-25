import { db } from "@/lib/db";
import { pallets, items, locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import PrintLabel from "./PrintLabel";

async function getPallet(label: string) {
  const [row] = await db
    .select({
      label: pallets.label,
      quantity: pallets.quantity,
      workOrderNumber: pallets.workOrderNumber,
      itemSku: items.sku,
      itemName: items.name,
      locationCode: locations.code,
      locationType: locations.type,
      createdAt: pallets.createdAt,
    })
    .from(pallets)
    .innerJoin(items, eq(pallets.itemId, items.id))
    .innerJoin(locations, eq(pallets.locationId, locations.id))
    .where(eq(pallets.label, label));

  return row ?? null;
}

export default async function PrintLabelPage({
  params,
}: {
  params: Promise<{ label: string }>;
}) {
  const { label: rawLabel } = await params;
  const label = decodeURIComponent(rawLabel);
  const pallet = await getPallet(label);

  if (!pallet) {
    notFound();
  }

  return <PrintLabel pallet={pallet} />;
}