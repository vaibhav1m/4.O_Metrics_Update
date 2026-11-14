import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/authConfig";
import { tokenFromCookieHeader, validateToken } from "@/lib/session";

// The signed-in user, their role and feature grants — for the UI to hide actions.
// The server checks in src/proxy.ts are what actually enforce access.
export async function GET(request: Request) {
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await validateToken(token);
  if (result.status === "ok") {
    const { session } = result;
    return NextResponse.json({
      user: { id: session.userId, name: session.name, email: session.email },
      role: session.role,
      orgName: session.orgName,
      features: session.features,
    });
  }
  if (result.status === "unavailable") return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
  const res = NextResponse.json(
    { error: result.status === "forbidden" ? result.message : "Session expired" },
    { status: result.status === "forbidden" ? 403 : 401 }
  );
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
