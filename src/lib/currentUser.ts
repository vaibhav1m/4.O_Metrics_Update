import { getSession } from "@/lib/session";

// "The current user" is the signed-in mark8auth user. Folders are per user via
// owner_username (the session email, lowercased); the audit log's changed_by and
// the query log's executed_by (both TEXT) get the same value.
export async function getRequestUser(request: Request): Promise<string | null> {
  const session = await getSession(request);
  return session?.email || null;
}
