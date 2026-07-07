# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test suite is configured.

## Architecture

**4.OMetrics Admin** is a Next.js 16 full-stack admin dashboard for managing PostgreSQL tables via a web UI.

### Data Flow

1. **Home page** (`src/app/page.tsx`) fetches table configurations from `/api/config`, which reads `src/data/tables.json`. Users can add/remove table entries from this JSON at runtime.

2. **Table page** (`src/app/[table]/page.tsx`) fetches records from `/api/tables/[tableName]`. The API dynamically discovers columns from PostgreSQL's `information_schema` rather than using hardcoded schemas.

3. **API routes** (`src/app/api/`) handle all mutations. The tables API validates requests against the whitelist in `tables.json` before executing SQL.

### Key Design Decisions

- **`src/data/tables.json`** is the source of truth for which tables are exposed. Each entry has `id`, `name`, `description`, `icon`, and `primaryKey`.

- **Dynamic schema discovery**: `GET /api/tables/[tableName]` queries `information_schema.columns` to determine columns at runtime — no hardcoded field definitions.

- **Platform JOIN**: If a table has a `platform_id` column, the API automatically joins `v3_t_master_platforms` to include `platform_name`.

- **Primary key variability**: Tables use different PKs (`id`, `module_id`, `platform_id`). The correct PK is stored in `tables.json` and used for UPDATE/DELETE operations.

- **Read-only fields**: `created_time_stamp`, `updated_time_stamp`, `created_by`, `platform_name` are stripped from write operations in `EditModal.tsx`.

- **JSON field handling**: `EditModal.tsx` renders textarea inputs for object/array values and serializes them back to JSON on save.

### Database Connection

`src/lib/db.ts` exports a `query()` function backed by a `pg` connection pool. Credentials come from `.env.local`:

```
SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB, SQL_PORT
```

Pool settings: max 20 connections, 30s idle timeout, 2s connection timeout.

### Styling

All styles are in `src/app/globals.css` — a single CSS file with a glassmorphic dark theme using CSS variables. No CSS modules or Tailwind. Component styles use class names like `.btn`, `.card`, `.table-container`, `.modal`.
