import { NextResponse } from "next/server";
import { appId, authBase, authConfigured, baseCookieOptions, DEVICE_COOKIE, SESSION_COOKIE } from "@/lib/authConfig";
import { jwtExpiry } from "@/lib/session";

// Helpers for the /api/auth/* route handlers, which call mark8auth server-side.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthJson = any;

export function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** POST JSON to mark8auth. Returns its status + parsed body, or a ready-made failure response. */
export async function callAuth(path: string, body: unknown): Promise<
  { ok: true; status: number; json: AuthJson } | { ok: false; response: NextResponse }
> {
  if (!authConfigured()) return { ok: false, response: fail("Auth is not configured (AUTH_URL / APP_ID).", 500) };
  try {
    const res = await fetch(`${authBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, response: fail(json?.message || "Sign-in failed.", res.status >= 400 && res.status < 600 ? res.status : 502) };
    }
    return { ok: true, status: res.status, json };
  } catch (err) {
    console.error("mark8auth unreachable:", (err as Error).message);
    return { ok: false, response: fail("Could not reach the authentication service.", 503) };
  }
}

export function withAppId<T extends object>(body: T) {
  return { ...body, app_id: appId() };
}

/** JSON success response that also sets the session cookie (and the device cookie when given). */
export function sessionResponse(data: AuthJson, extra?: { deviceToken?: string; deviceExpiresAt?: string }) {
  const token: string = data.token;
  const res = NextResponse.json({ user: data.user });
  const exp = jwtExpiry(token);
  res.cookies.set(SESSION_COOKIE, token, {
    ...baseCookieOptions(),
    ...(exp ? { expires: new Date(exp * 1000) } : {}),
  });
  if (extra?.deviceToken) {
    const expires = extra.deviceExpiresAt ? new Date(extra.deviceExpiresAt) : new Date(Date.now() + 30 * 86400_000);
    res.cookies.set(DEVICE_COOKIE, extra.deviceToken, { ...baseCookieOptions(), expires });
  }
  return res;
}
