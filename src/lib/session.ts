import { appId, authBase, SESSION_COOKIE } from "@/lib/authConfig";
import { allows, type Action, type Feature, type Features } from "@/lib/routePermissions";

// Server-side session: the mark8auth JWT lives in an httpOnly cookie and is
// validated against mark8auth's /validateAppAccess. Successful results are cached
// in memory per token for a short time so a page load with a dozen API calls
// costs one round trip, not a dozen. A revoked/superseded token is therefore
// honoured for at most CACHE_TTL_MS.

export interface Session {
  userId: string;
  name: string;
  email: string;
  role: string | null;
  orgName: string | null;
  features: Features;
}

export type ValidateResult =
  | { status: "ok"; session: Session }
  | { status: "unauthorized" } // 401: missing/expired/superseded token
  | { status: "forbidden"; message: string } // 403: no access to this app
  | { status: "unavailable" }; // auth service unreachable / 5xx

const CACHE_TTL_MS = 45_000;
const CACHE_MAX = 500;

// globalThis so the proxy bundle and route-handler bundles share one cache in the same process.
const g = globalThis as unknown as { __dbxSessionCache?: Map<string, { session: Session; expires: number }> };
const cache = (g.__dbxSessionCache ??= new Map());

/** exp (seconds) from a JWT payload, without verifying it — mark8auth does that. */
export function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function evictSession(token: string) {
  cache.delete(token);
}

export async function validateToken(token: string): Promise<ValidateResult> {
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && hit.expires > now) return { status: "ok", session: hit.session };
  cache.delete(token);

  const exp = jwtExpiry(token);
  if (exp !== null && exp * 1000 <= now) return { status: "unauthorized" };

  let res: Response;
  try {
    res = await fetch(`${authBase()}/validateAppAccess?app_id=${encodeURIComponent(appId())}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("validateAppAccess unreachable:", (err as Error).message);
    return { status: "unavailable" };
  }

  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) {
    const body = await res.json().catch(() => null);
    return { status: "forbidden", message: body?.message || "You do not have access to this app." };
  }
  if (!res.ok) return { status: "unavailable" };

  const body = await res.json().catch(() => null);
  const data = body?.data;
  if (!data?.user_id || !data?.app) return { status: "unavailable" };

  const session: Session = {
    userId: data.user_id,
    name: data.user_name || data.email,
    email: String(data.email || "").toLowerCase(),
    role: data.app.role ?? null,
    orgName: data.app.org_name ?? null,
    features: data.app.features ?? {},
  };

  if (cache.size >= CACHE_MAX) {
    for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
    if (cache.size >= CACHE_MAX) cache.clear();
  }
  const expires = Math.min(now + CACHE_TTL_MS, exp !== null ? exp * 1000 : Infinity);
  cache.set(token, { session, expires });
  return { status: "ok", session };
}

export function tokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) {
      const v = part.slice(i + 1).trim();
      return v ? decodeURIComponent(v) : null;
    }
  }
  return null;
}

/** The validated session for a route-handler request, or null. Re-validates (cache-backed) on its own. */
export async function getSession(request: Request): Promise<Session | null> {
  const token = tokenFromCookieHeader(request.headers.get("cookie"));
  if (!token) return null;
  const result = await validateToken(token);
  return result.status === "ok" ? result.session : null;
}

export function can(session: Session | null, feature: Feature, action: Action): boolean {
  return Boolean(session) && allows(session!.features, feature, action);
}
