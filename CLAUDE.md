# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # Start development server (localhost:3000)
npm run build       # Production build
npm run start       # Start production server
npm run lint        # Run ESLint
npm run db:migrate  # Set up / update the control-plane schema (idempotent)
```

No test suite is configured. No authentication is currently wired up — every route is open.

## Architecture

**Database Explorer** is a Next.js 16 full-stack admin dashboard for browsing and editing tables across
*multiple* PostgreSQL databases from one UI.

### The two planes

- **Control plane** — Database Explorer's own `v3_t_dbexplorer_*` tables, holding connections, table
  configs, users, and the audit log. Lives in the Postgres database named by `SQL_DB` in `.env.local`,
  reached through `src/lib/db.ts`.
- **Data plane** — the databases being browsed. Reached through `src/lib/connections.ts`, which keeps a
  per-connection `pg.Pool` cache keyed by connection id (a UUID).

There is no "system" connection concept — every row in `v3_t_dbexplorer_connections`, including the one
pointing at this app's own control database, is a plain, fully editable and deletable connection with its
own stored (encrypted) credentials. Deleting that row doesn't affect the app itself (the control plane
always connects via the `SQL_*` env vars, independent of any row in its own table) — it just removes that
database from the browsable list until re-added.

### Control-plane tables

Defined in `migrations/*.sql` (applied in filename order by `db:migrate`). All primary keys are `uuid`
(`gen_random_uuid()`, native since Postgres 13 — no extension needed):

| Table | Holds |
|---|---|
| `v3_t_dbexplorer_connections` | One row per database connection; passwords AES-256-GCM encrypted |
| `v3_t_dbexplorer_data_sources` | Which tables are exposed, scoped per connection (replaced `tables.json`). Carries a denormalized `connection_name` column, kept in sync in application code — set on insert (`INSERT ... (SELECT name FROM v3_t_dbexplorer_connections WHERE id = $1)`) and cascaded on rename (`PUT /api/connections/[connectionId]`). Also carries `schema_name` (defaults `'public'`) — see Schema support below |
| `v3_t_dbexplorer_users` | Login accounts; bcrypt password hashes. Unused — scaffolded for when login is rebuilt |
| `v3_t_dbexplorer_audit_logs` | Every insert/update/delete with before/after JSON. `changed_by` is null until login exists |
| `v3_t_dbexplorer_query_logs` | Statement-level history of the Query Console (SQL text, read/write kind, status, row count, duration, error). Kept separate from the audit log, which is row-level and whose `action` CHECK only permits insert/update/delete |

These tables live in the same Postgres schema as the business `v3_t_*` tables they help manage. There is no
special-casing to hide them from the generic table editor — "Fetch Tables from Database" lists them like
any other table, and they can be registered as a normal data source. This is a deliberate choice, not an
oversight: registering `v3_t_dbexplorer_connections` and editing `password_encrypted` through the generic
editor means typing a plain value into what `decrypt()` expects as `iv.authTag.ciphertext` — it'll desync
the stored credential, and since row edits are audit-logged, whatever was typed lands in
`v3_t_dbexplorer_audit_logs.before_data`/`after_data` in the clear. Editing connections through the
dedicated Connections UI avoids this entirely; the generic editor has no reason to know that.

### Routing

Everything is scoped by connection id (a UUID, taken as-is from the route param — no parsing):

- `/` — connection list
- `/[connectionId]` — table configs for that connection
- `/[connectionId]/[table]` — the data grid
- `/[connectionId]/console` — the Query Console
- `/api/connections/[connectionId]/tables/[tableName]` — row CRUD
- `/api/connections/[connectionId]/tables/[tableName]/distinct` — column filter values
- `/api/connections/[connectionId]/tables/import` — copy data-source *configs* from another connection
- `/api/connections/[connectionId]/tables/[tableName]/import` — copy row *data* from a table on another
  connection
- `/api/connections/[connectionId]/schema/tables` — real tables in the DB not yet registered
- `/api/connections/[connectionId]/query` — run console SQL
- `/api/connections/[connectionId]/query/logs` — console history (GET) / clear it (DELETE)

### Schema support

Data sources aren't limited to the `public` schema. `v3_t_dbexplorer_data_sources.schema_name` records
which schema a table lives in (default `'public'`, so existing configs are unaffected); every query that
touches the underlying table — row CRUD, distinct values, both import paths — reads it off `getDataSource()`
and interpolates `"schema"."table"` instead of a hardcoded `public."table"`. `v3_t_master_platforms` (the
platform-name JOIN) is the one fixed exception: it's always looked up in `public`, independent of whatever
schema the table being viewed lives in.

`GET /api/connections/[connectionId]/schema/tables` (the "Fetch Tables from Database" discovery list) scans
every schema except Postgres's own internal ones, and includes `BASE TABLE`, `VIEW`, and `FOREIGN` types —
not just base tables in `public`. The single-table variant
(`/schema/tables/[tableName]?schema=`) takes the schema as a query param, defaulting to `public` for
backward compatibility.

**Known limitation**: a `table_id` is still unique per connection *regardless of schema* — matching how
routing (`/[connectionId]/[table]`) and `getDataSource()` key purely by table name, with no schema in the
URL. If the same table name exists in two schemas on one connection, only one can be registered; the
"Fetch Tables" list and the manual "Add Table Config" form don't stop you from picking either, but whichever
is added second will hit the data source's unique constraint. This wasn't worth solving generally — it's a
rare collision, and fixing it properly would mean threading schema through the URL/routing layer too.

### Query Console

`/[connectionId]/console` runs arbitrary SQL against a connection. Unlike everything else in the app,
this deliberately bypasses the data-source whitelist — it is the one place that can reach any table.

`classifyStatement()` in `src/lib/sqlSafety.ts` labels each submission `read` or `write`; writes are
rejected with HTTP 409 `requiresConfirmation` unless the request carries `confirmed: true`. **The gate is
enforced in the API route, not just the UI**, so skipping the dialog doesn't skip the check.

The classifier resolves all ambiguity toward `write` — a misclassified SELECT costs one extra click,
whereas the reverse would let a DELETE through silently. It strips comments, string literals, and quoted
identifiers first (so `SELECT 'drop table x'` stays a read, and a keyword can't hide inside a comment),
then scans the *whole* sanitized text for write keywords — which is what catches multi-statement
submissions (`SELECT 1; DROP TABLE x`) and CTE-wrapped writes (`WITH x AS (DELETE ...) SELECT ...`).
Anything whose leading keyword isn't a known read verb is treated as a write.

Every executed statement is logged to `v3_t_dbexplorer_query_logs`, including failures. Statements
blocked by the confirmation gate are *not* logged — nothing ran. Queries run with a 30s
`statement_timeout`, and at most 500 rows are returned to the browser (`rowCount` still reports the true
total).

### Cross-connection import

Two distinct features, both reachable from the UI:

- **Import Tables** (on `/[connectionId]`) — copies data-source configs from another connection, e.g.
  "UAE also has `v3_t_master_platforms`, register it here too." Multi-select checkboxes; each candidate is
  checked against this connection's real `information_schema` before being registered, so it can't create
  a config pointing at a table that doesn't exist here.
- **Import Data** (on `/[connectionId]/[table]`) — copies row *data* from a table on another connection
  into the table you're viewing. Both sides must already be registered data sources (this can't be used to
  reach an arbitrary, un-whitelisted table). Only columns present on both sides are copied; existing rows
  (matched by the target's primary key, compared as text to stay agnostic of the PK's actual type) are left
  untouched — it only adds rows, never overwrites. Capped at 10,000 source rows per request.

### Key Design Decisions

- **Table whitelisting**: `getDataSource()` in `src/lib/dataSource.ts` is the single gate — a table is
  reachable only if a matching `v3_t_dbexplorer_data_sources` row exists *for that connection*. A table
  configured on connection A is not reachable through connection B.

- **Identifier validation**: table and column names cannot be parameterised, so they are interpolated
  into SQL. `isValidIdentifier()` restricts them to `[A-Za-z_][A-Za-z0-9_]*`, enforced both when a config
  is saved and again when it is read back.

- **Dynamic schema discovery**: columns come from `information_schema.columns` at request time — no
  hardcoded field definitions.

- **Platform JOIN**: if a table has a `platform_id` column *and* the connection actually has a
  `v3_t_master_platforms` table, the API joins it to add `platform_name`. The existence check matters —
  not every connection has that table.

- **Primary key variability**: tables use different PKs (`id`, `module_id`, `platform_id`). The correct PK
  is stored per data source and used for UPDATE/DELETE.

- **Read-only fields**: `created_time_stamp`, `updated_time_stamp`, `created_by`, `platform_name` are
  stripped from write operations in `EditModal.tsx`.

- **JSON field handling**: `EditModal.tsx` renders textareas for object/array values and serializes them
  back to JSON on save.

### Environment

`.env.local` (gitignored):

```
SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB, SQL_PORT   # control-plane database
ENCRYPTION_KEY     # base64, 32 bytes  — generated by db:migrate if absent
```

`npm run db:migrate` also registers the control DB itself as a normal connection ("Infytrix"), seeds
connections from any `SQL_*_TEMP` / `SQL_*_UAE` variables, and imports `src/data/tables.json`. That JSON
file is **legacy seed data only** — it is no longer read at runtime; `v3_t_dbexplorer_data_sources` is the
source of truth. Table configs for additional connections (e.g. mirroring System → UAE) are set up through
the in-app Import Tables feature, not the migration script.

### Auth

Removed for now (was JWT-cookie sessions gating every route via `src/proxy.ts`, Next 16's replacement for
`middleware.ts`). `v3_t_dbexplorer_users` and the `changed_by` column on the audit log are still there,
unused, for whenever it's rebuilt.

### Trino

Not implemented. `v3_t_dbexplorer_connections.type` accepts `'trino'` and the UI shows a disabled option,
but `getPoolFor()` throws for any non-postgres type. Trino speaks HTTP/JSON rather than the Postgres wire
protocol, so it needs the `trino-client` package and a separate query path; its `information_schema` is
catalog-qualified, and write support depends on the underlying connector.

### Styling

All styles are in `src/app/globals.css` — a single CSS file with a glassmorphic dark theme using CSS
variables. No CSS modules or Tailwind. Class names like `.btn`, `.glass-card`, `.modal`, `.breadcrumb`.
