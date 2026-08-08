-- Renames the control-plane tables into the v3_t_dbexplorer_* family (so they sit
-- alongside the rest of the v3_t_* schema) and switches every primary key to UUID.
-- Also drops the "system connection" concept — every connection is now a plain,
-- fully editable/removable row; the row for this app's own control database is
-- just a normal connection with its own stored (encrypted) credentials.
--
-- This is a clean cutover, not an in-place ALTER: the old admin_* tables held only
-- scaffolding data (a handful of connections/data-source configs), so they are
-- dropped and the new tables are reseeded by `npm run db:migrate` immediately after.

DROP TABLE IF EXISTS admin_audit_log CASCADE;
DROP TABLE IF EXISTS admin_data_sources CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS admin_connections CASCADE;

CREATE TABLE IF NOT EXISTS v3_t_dbexplorer_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v3_t_dbexplorer_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('postgres', 'trino')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT,
  extra_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v3_t_dbexplorer_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES v3_t_dbexplorer_connections(id) ON DELETE CASCADE,
  connection_name TEXT NOT NULL,
  table_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'Database',
  color TEXT NOT NULL DEFAULT '#60a5fa',
  primary_key TEXT NOT NULL DEFAULT 'id',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, table_id)
);

CREATE TABLE IF NOT EXISTS v3_t_dbexplorer_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES v3_t_dbexplorer_connections(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  record_pk TEXT,
  changed_by TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dbexplorer_data_sources_connection ON v3_t_dbexplorer_data_sources(connection_id);
CREATE INDEX IF NOT EXISTS idx_dbexplorer_audit_logs_lookup ON v3_t_dbexplorer_audit_logs(connection_id, table_name);
