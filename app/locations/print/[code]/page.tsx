import { db } from "@/lib/db";
import { locations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import PrintLocationLabel from "./PrintLocationLabel";

async function getLocation(code: string) {
  const [row] = await db.select().from(locations).where(eq(locations.code, code));
  return row ?? null;
}

export default async function PrintLocationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);
  const location = await getLocation(code);

  if (!location) {
    notFound();
  }

  return <PrintLocationLabel location={location} />;
}