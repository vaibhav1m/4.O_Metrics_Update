// Auth settings shared by the proxy, route handlers and server helpers.
// AUTH_URL = mark8auth base URL (no trailing slash needed), APP_ID = this app's id in mark8auth.

export const SESSION_COOKIE = "dbx_session";
export const DEVICE_COOKIE = "dbx_device";

export function authBase(): string {
  const url = (process.env.AUTH_URL || "").replace(/\/+$/, "");
  return `${url}/api/v1/auth`;
}

export function appId(): string {
  return process.env.APP_ID || "";
}

export function authConfigured(): boolean {
  return Boolean(process.env.AUTH_URL && process.env.APP_ID);
}

export function cookieSecure(): boolean {
  const flag = process.env.SESSION_COOKIE_SECURE;
  if (flag !== undefined && flag !== "") return flag === "true" || flag === "1";
  return process.env.NODE_ENV === "production";
}

export function baseCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: cookieSecure(), path: "/" };
}
