// Classifies console SQL as read-only vs. write so the API can require an
// explicit confirmation before anything that could change data or schema.
//
// The classifier is deliberately conservative: anything it can't confidently
// prove is read-only is treated as a write. Misclassifying a SELECT as a write
// costs one extra confirmation click; the reverse would let a DELETE through
// silently, so all ambiguity resolves toward "write".

export type StatementKind = "read" | "write";

// Leading keywords that can begin a read-only statement. A statement starting
// with anything else is treated as a write.
const READ_LEADERS = new Set(["select", "with", "show", "explain", "table", "values"]);

// If any of these appear as a bare word anywhere in the sanitized SQL, the whole
// submission counts as a write. Scanning the entire text (rather than just the
// leading keyword) is what catches `WITH x AS (...) INSERT ...` and multi-statement
// submissions like `SELECT 1; DROP TABLE users`.
const WRITE_KEYWORDS = [
  "insert", "update", "delete", "drop", "truncate", "alter", "create", "replace",
  "grant", "revoke", "merge", "copy", "call", "do", "refresh", "vacuum", "reindex",
  "cluster", "lock", "comment", "import", "load", "security", "set", "reset",
  "discard", "prepare", "execute", "deallocate", "begin", "start", "commit",
  "rollback", "savepoint", "listen", "unlisten", "notify", "analyze", "checkpoint",
];

const WRITE_KEYWORD_RE = new RegExp(`\\b(${WRITE_KEYWORDS.join("|")})\\b`, "i");

// Removes comments, string literals, and quoted identifiers so that keywords
// appearing inside them (e.g. SELECT 'drop table x', or a column named "delete")
// don't trigger a false write classification — and, conversely, so a real
// keyword can't hide behind a comment.
export function sanitizeSql(sql: string): string {
  let out = "";
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      out += " ";
      continue;
    }

    if (two === "/*") {
      // Postgres block comments nest.
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql.slice(i, i + 2) === "/*") { depth++; i += 2; }
        else if (sql.slice(i, i + 2) === "*/") { depth--; i += 2; }
        else i++;
      }
      out += " ";
      continue;
    }

    const ch = sql[i];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; } // escaped quote
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }

    // Dollar-quoted string: $tag$ ... $tag$
    if (ch === "$") {
      const tagMatch = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? sql.length : end + tag.length;
        out += " ";
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

export function classifyStatement(sql: string): StatementKind {
  const sanitized = sanitizeSql(sql).trim();
  if (!sanitized) return "write"; // nothing provable — stay conservative

  if (WRITE_KEYWORD_RE.test(sanitized)) return "write";

  const leading = (sanitized.match(/[A-Za-z_]+/) || [""])[0].toLowerCase();
  return READ_LEADERS.has(leading) ? "read" : "write";
}

export function isEmptyStatement(sql: string): boolean {
  return sanitizeSql(sql).trim().length === 0 && sql.trim().length === 0;
}
