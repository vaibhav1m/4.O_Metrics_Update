-- Data sources were implicitly assumed to live in the "public" schema
-- everywhere — table/row CRUD, distinct values, cross-connection import all
-- hardcoded it. Some connections have real tables in other schemas (e.g.
-- Infytrix's "dataval" schema), which were completely invisible to the app.
-- This column lets a data source point at any schema; existing rows default
-- to 'public', preserving current behavior exactly.

ALTER TABLE v3_t_dbexplorer_data_sources
  ADD COLUMN IF NOT EXISTS schema_name TEXT NOT NULL DEFAULT 'public';
