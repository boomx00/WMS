import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signSession } from "@/lib/auth";

// POST /api/auth/login
// body: { username, password }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json(
      { error: "username and password are required" },
      { status: 400 }
    );
  }

  const [user] = await db.select().from(users).where(eq(users.username, username));

  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await signSession({
    userId: user.id,
    username: user.username,
    roleId: user.roleId,
  });

  const response = NextResponse.json({
    id: user.id,
    username: user.username,
    roleId: user.roleId,
  });

  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours, matches JWT expiry
  });

  return response;
}