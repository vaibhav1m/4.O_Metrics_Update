// There's no login yet, so "the current user" is whatever name the browser
// sends in this header (set via the user badge in the nav bar, kept in
// localStorage). It scopes per-user data like folders — it is NOT a security
// boundary; anyone can send any name. Replace with the session once auth exists.
export const USER_HEADER = "x-dbexplorer-user";

const MAX_USERNAME_LENGTH = 64;

export function normalizeUsername(value: string | null | undefined): string | null {
  const name = (value || "").trim().toLowerCase();
  if (!name || name.length > MAX_USERNAME_LENGTH) return null;
  return name;
}

export function getRequestUser(request: Request): string | null {
  return normalizeUsername(request.headers.get(USER_HEADER));
}
