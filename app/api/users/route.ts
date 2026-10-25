import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import bcrypt from "bcryptjs";

// GET /api/users - list all users (never return passwordHash)
export async function GET() {
  const rows = await db.select().from(users);
  const safe = rows.map(({ passwordHash, ...rest }) => rest);
  return NextResponse.json(safe);
}

// POST /api/users - create a user
// body: { username, password, roleId }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password, roleId } = body;

  if (!username || !password || !roleId) {
    return NextResponse.json(
      { error: "username, password, and roleId are required" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [created] = await db
    .insert(users)
    .values({ username, passwordHash, roleId })
    .returning();

  const { passwordHash: _, ...safe } = created;
  return NextResponse.json(safe, { status: 201 });
}