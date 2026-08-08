-- Database Explorer control-plane schema.
-- Run once against the "system" Postgres database (the one already configured
-- via SQL_HOST/SQL_USER/SQL_PASSWORD/SQL_DB/SQL_PORT in .env.local).
-- Safe to re-run: every statement is idempotent.

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_connections (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('postgres', 'trino')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  database_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT,
  extra_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_data_sources (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES admin_connections(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER REFERENCES admin_connections(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  record_pk TEXT,
  changed_by TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_data_sources_connection ON admin_data_sources(connection_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_lookup ON admin_audit_log(connection_id, table_name);
