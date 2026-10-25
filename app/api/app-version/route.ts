import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appVersion } from "@/db/schema";

// GET /api/app-version - what's the latest PDA app build?
export async function GET() {
  const [row] = await db.select().from(appVersion).orderBy(appVersion.id).limit(1);
  if (!row) {
    return NextResponse.json({ error: "No version info set yet" }, { status: 404 });
  }
  return NextResponse.json(row);
}