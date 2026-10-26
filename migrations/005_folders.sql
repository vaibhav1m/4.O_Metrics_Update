-- Per-user folders for grouping a connection's tables on /[connectionId].
--
-- A folder belongs to one connection and one user. A table (data source) can sit
-- in any number of folders at once — the link table is a plain many-to-many with
-- no uniqueness beyond "not twice in the same folder".
--
-- There's no login yet, so owner_username is the free-text name the browser
-- sends in the x-dbexplorer-user header (lowercased by the API). When login is
-- rebuilt, this is the column to repoint at v3_t_dbexplorer_users.
--
-- The "data source belongs to the same connection as the folder" rule isn't
-- expressible as a plain FK; it's enforced in the API's INSERT ... SELECT.

CREATE TABLE IF NOT EXISTS v3_t_dbexplorer_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES v3_t_dbexplorer_connections(id) ON DELETE CASCADE,
  owner_username TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, owner_username, name)
);

CREATE TABLE IF NOT EXISTS v3_t_dbexplorer_folder_tables (
  folder_id UUID NOT NULL REFERENCES v3_t_dbexplorer_folders(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES v3_t_dbexplorer_data_sources(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, data_source_id)
);

CREATE INDEX IF NOT EXISTS idx_dbexplorer_folders_owner
  ON v3_t_dbexplorer_folders(connection_id, owner_username);
CREATE INDEX IF NOT EXISTS idx_dbexplorer_folder_tables_data_source
  ON v3_t_dbexplorer_folder_tables(data_source_id);
