import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getItemAttributeOptions } from "@/lib/itemAttributes";

export const dynamic = "force-dynamic";

// GET /api/items/attributes
// Every product Type, Brand and Tag in use: { types, brands, tags } — for
// pickers such as Movement History's advanced search.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  return NextResponse.json(await getItemAttributeOptions(db));
}
