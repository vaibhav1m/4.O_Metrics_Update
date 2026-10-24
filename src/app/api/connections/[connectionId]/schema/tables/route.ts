import { NextResponse } from "next/server";
import { queryConnection } from "@/lib/connections";
import { query as controlQuery } from "@/lib/db";

// Lists real tables (and views, and foreign tables) across every schema in
// this connection's database — except Postgres's own internal schemas — that
// aren't already registered as a data source here. The candidate pool for
// "Fetch Tables from Database". Nothing is hidden, including this app's own
// v3_t_dbexplorer_* control tables — registering v3_t_dbexplorer_connections
// as a data source lets you edit password_encrypted as plain text, which will
// desync it from what decrypt() expects and (since row edits are audit-logged)
// write whatever you typed there into v3_t_dbexplorer_audit_logs in the clear.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  try {
    const [tablesResult, configuredResult] = await Promise.all([
      queryConnection(connectionId, `
        SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_schema NOT LIKE 'pg_toast%'
          AND table_schema NOT LIKE 'pg_temp%'
          AND table_type IN ('BASE TABLE', 'VIEW', 'FOREIGN')
        ORDER BY table_schema, table_name
      `, []),
      controlQuery("SELECT table_id FROM v3_t_dbexplorer_data_sources WHERE connection_id = $1", [connectionId]),
    ]);

    // A table_id is only ever registered once per connection regardless of
    // schema (see the note on the tables POST route), so exclusion is by
    // name alone — if the same name exists in two schemas and one is
    // registered, the other is treated as taken too rather than offered.
    const configured = new Set(configuredResult.rows.map((r: any) => r.table_id));
    const tables = tablesResult.rows
      .filter((r: any) => !configured.has(r.table_name))
      .map((r: any) => ({ schema: r.table_schema as string, table: r.table_name as string }));

    return NextResponse.json({ tables });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
