import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { locations } from "@/db/schema";

// GET /api/locations - list all locations
export async function GET() {
  const rows = await db.select().from(locations);
  return NextResponse.json(rows);
}

// POST /api/locations - create a location
// body: { code, type, area?, x?, y? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, type, area, x, y } = body;

  if (!code || !type) {
    return NextResponse.json(
      { error: "code and type are required" },
      { status: 400 }
    );
  }

  const [created] = await db
    .insert(locations)
    .values({ code, type, area, x, y })
    .returning();

  return NextResponse.json(created, { status: 201 });
}