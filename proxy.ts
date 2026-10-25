import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getPageAccess } from "@/lib/pagePermissions";
import { canAccessPath, firstAllowedPath } from "@/lib/pages";

// Next 16 renamed middleware.ts → proxy.ts. Proxy runs on the Node.js
// runtime, so it can query the DB for the user's page permissions.

const PUBLIC_PATHS = ["/login"];

function toLogin(req: NextRequest, clearSession: boolean) {
  const response = NextResponse.redirect(new URL("/login", req.url));
  if (clearSession) response.cookies.delete("session");
  return response;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let API routes handle their own auth (they already do via getSession).
  // This is also what keeps the PDA app working for non-admin roles.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    return toLogin(req, false);
  }

  // Web pages need a web-login session (one that carries client: "web"),
  // so action permissions can be enforced on it. Older web tokens issued
  // before this flag existed just log in again once.
  if (session.client !== "web") {
    return toLogin(req, true);
  }

  const access = await getPageAccess(session.userId);

  // User deleted, or role has no web pages at all → sign them out of web.
  const fallback = access ? firstAllowedPath(access) : null;
  if (!access || !fallback) {
    return toLogin(req, true);
  }

  if (!canAccessPath(pathname, access)) {
    // Avoid a redirect loop if the fallback itself is somehow blocked.
    if (pathname === fallback) return toLogin(req, true);
    return NextResponse.redirect(new URL(fallback, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
