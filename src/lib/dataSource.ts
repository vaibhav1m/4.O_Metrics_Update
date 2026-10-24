import { query as controlQuery } from "./db";

// Table and column names cannot be parameterised, so they are interpolated into
// SQL. Restrict them to plain identifiers before they ever reach a query.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

export interface DataSourceRow {
  id: string;
  connection_id: string;
  connection_name: string;
  table_id: string;
  schema_name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  primary_key: string;
  sort_order: number;
}

export async function getDataSource(connectionId: string, tableId: string): Promise<DataSourceRow | null> {
  const result = await controlQuery(
    "SELECT * FROM v3_t_dbexplorer_data_sources WHERE connection_id = $1 AND table_id = $2",
    [connectionId, tableId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!isValidIdentifier(row.table_id) || !isValidIdentifier(row.primary_key) || !isValidIdentifier(row.schema_name)) return null;
  return row;
}
