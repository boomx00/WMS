import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roles } from "@/db/schema";

// GET /api/roles - list all roles
export async function GET() {
  const rows = await db.select().from(roles);
  return NextResponse.json(rows);
}

// POST /api/roles - create a role
// body: { name }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [created] = await db.insert(roles).values({ name }).returning();
  return NextResponse.json(created, { status: 201 });
}