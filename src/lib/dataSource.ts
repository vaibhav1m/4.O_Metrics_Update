import { query as controlQuery } from "./db";

// Table and column names cannot be parameterised, so they are interpolated into
// SQL. Restrict them to plain identifiers before they ever reach a query.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}

// Database Explorer's own control-plane tables should never be added as a
// browsable/editable data source — they're managed through the Connections UI,
// which handles encryption and referential integrity the generic table editor
// doesn't know about.
const RESERVED_TABLE_PREFIX = "v3_t_dbexplorer_";

export function isReservedTableId(tableId: string): boolean {
  return tableId.startsWith(RESERVED_TABLE_PREFIX);
}

export interface DataSourceRow {
  id: string;
  connection_id: string;
  connection_name: string;
  table_id: string;
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
  if (!isValidIdentifier(row.table_id) || !isValidIdentifier(row.primary_key)) return null;
  return row;
}
