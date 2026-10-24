-- History of statements run through the in-app Query Console.
--
-- Deliberately separate from v3_t_dbexplorer_audit_logs: that table is row-level
-- (table_name, record_pk, before/after JSON, and an action CHECK limited to
-- insert/update/delete), whereas a console run is statement-level — arbitrary SQL
-- text, a duration, a row count, and possibly an error instead of a result.

CREATE TABLE IF NOT EXISTS v3_t_dbexplorer_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES v3_t_dbexplorer_connections(id) ON DELETE SET NULL,
  connection_name TEXT NOT NULL DEFAULT '',
  sql_text TEXT NOT NULL,
  statement_kind TEXT NOT NULL CHECK (statement_kind IN ('read', 'write')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  row_count INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  executed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dbexplorer_query_logs_connection
  ON v3_t_dbexplorer_query_logs(connection_id, created_at DESC);
