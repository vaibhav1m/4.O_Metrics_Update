import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/authConfig";
import { evictSession, tokenFromCookieHeader } from "@/lib/session";

// Clears the session cookie. The "remember this device" cookie is kept on purpose.
export async function POST(request: Request) {
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  if (token) evictSession(token);
  const res = NextResponse.json({ message: "Signed out" });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
