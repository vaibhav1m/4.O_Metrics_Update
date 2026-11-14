// The one place that maps every API route to a feature + action. Anything under
// /api that is not listed here (or uses a method that is not listed) is denied.
// Enforced by src/proxy.ts; the console's read/write split is additionally
// enforced in the query route itself.

export type Feature = "dbx.connections" | "dbx.tables" | "dbx.data" | "dbx.console" | "dbx.folders";
export type Action = "VIEW" | "EDIT";
export type Requirement = { feature: Feature; action: Action };

const V = (feature: Feature): Requirement => ({ feature, action: "VIEW" });
const E = (feature: Feature): Requirement => ({ feature, action: "EDIT" });

type Rule = { pattern: RegExp; methods: Record<string, Requirement> };

const SEG = "[^/]+";

// Order matters: literal segments (/tables/import, /connections/test) come before
// the /:tableName and /:connectionId wildcards they would otherwise match.
const RULES: Rule[] = [
  // Connections
  { pattern: /^\/api\/connections$/, methods: { GET: V("dbx.connections"), POST: E("dbx.connections") } },
  { pattern: /^\/api\/connections\/test$/, methods: { POST: E("dbx.connections") } },
  { pattern: new RegExp(`^/api/connections/${SEG}$`), methods: { GET: V("dbx.connections"), PUT: E("dbx.connections"), DELETE: E("dbx.connections") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/test$`), methods: { POST: E("dbx.connections") } },

  // Table configs (data sources)
  { pattern: new RegExp(`^/api/connections/${SEG}/tables$`), methods: { GET: V("dbx.tables"), POST: E("dbx.tables"), PUT: E("dbx.tables"), DELETE: E("dbx.tables") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/tables/import$`), methods: { POST: E("dbx.tables") } },
  // "Fetch tables from database" discovery lists every real table in the DB, not
  // just the registered ones, and only exists to register them: EDIT.
  { pattern: new RegExp(`^/api/connections/${SEG}/schema/tables$`), methods: { GET: E("dbx.tables") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/schema/tables/${SEG}$`), methods: { GET: E("dbx.tables") } },

  // Row data
  { pattern: new RegExp(`^/api/connections/${SEG}/tables/${SEG}$`), methods: { GET: V("dbx.data"), POST: E("dbx.data"), PUT: E("dbx.data"), DELETE: E("dbx.data") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/tables/${SEG}/distinct$`), methods: { GET: V("dbx.data") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/tables/${SEG}/import/preview$`), methods: { POST: V("dbx.data") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/tables/${SEG}/import$`), methods: { POST: E("dbx.data") } },

  // Query console. POST needs VIEW here; the route itself demands EDIT for statements classified as write.
  { pattern: new RegExp(`^/api/connections/${SEG}/query$`), methods: { POST: V("dbx.console") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/query/logs$`), methods: { GET: V("dbx.console"), DELETE: E("dbx.console") } },

  // Folders
  { pattern: new RegExp(`^/api/connections/${SEG}/folders$`), methods: { GET: V("dbx.folders"), POST: E("dbx.folders") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/folders/${SEG}$`), methods: { PUT: E("dbx.folders"), DELETE: E("dbx.folders") } },
  { pattern: new RegExp(`^/api/connections/${SEG}/folders/${SEG}/tables$`), methods: { POST: E("dbx.folders"), DELETE: E("dbx.folders") } },
];

/** The requirement for this request, or null when the route/method is unmapped (deny). */
export function requirementFor(pathname: string, method: string): Requirement | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const rule of RULES) {
    if (rule.pattern.test(path)) return rule.methods[method.toUpperCase()] ?? null;
  }
  return null;
}

export type Features = Record<string, { allow?: string[]; denied?: string }>;

export function allows(features: Features | undefined, feature: Feature, action: Action): boolean {
  const entry = features?.[feature];
  return Boolean(entry && Array.isArray(entry.allow) && entry.allow.includes(action));
}
