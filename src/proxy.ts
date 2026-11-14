import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/authConfig";
import { requirementFor, allows } from "@/lib/routePermissions";
import { validateToken } from "@/lib/session";

// Next 16's replacement for middleware.ts (Node.js runtime). Gate for every page
// and API route except /login and /api/auth/*: a valid mark8auth session for this
// app is required, and API calls must be allowed by src/lib/routePermissions.ts.

const clearSession = (res: NextResponse) => {
  res.cookies.delete(SESSION_COOKIE);
  return res;
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (pathname.startsWith("/api/auth/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const result = token ? await validateToken(token) : null;

  if (pathname === "/login") {
    if (result?.status === "ok") {
      const next = request.nextUrl.searchParams.get("next");
      return NextResponse.redirect(new URL(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", request.url));
    }
    return NextResponse.next();
  }

  if (!result || result.status === "unauthorized" || result.status === "forbidden") {
    const stale = Boolean(token);
    if (isApi) {
      const message = result?.status === "forbidden" ? result.message : "Not signed in";
      const res = NextResponse.json({ error: message }, { status: result?.status === "forbidden" ? 403 : 401 });
      return stale ? clearSession(res) : res;
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    if (result?.status === "forbidden") url.searchParams.set("error", result.message);
    const res = NextResponse.redirect(url);
    return stale ? clearSession(res) : res;
  }

  if (result.status === "unavailable") {
    return isApi
      ? NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 })
      : new NextResponse("Authentication service unavailable. Try again shortly.", { status: 503 });
  }

  if (isApi) {
    const need = requirementFor(pathname, request.method);
    if (!need || !allows(result.session.features, need.feature, need.action)) {
      return NextResponse.json(
        { error: need ? `You do not have ${need.action} access to ${need.feature}` : "Forbidden" },
        { status: 403 }
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map)$).*)"],
};
