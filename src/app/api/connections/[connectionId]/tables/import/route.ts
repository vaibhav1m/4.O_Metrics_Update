import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";
import { queryConnection } from "@/lib/connections";

type Params = { params: Promise<{ connectionId: string }> };

// Copies data-source *configs* (not row data) from another connection's table
// list onto this connection — e.g. "this connection also has v3_t_master_users,
// register it here too". Each candidate table is checked against this
// connection's actual information_schema before being registered, so importing
// never creates a config pointing at a table that doesn't exist here.
export async function POST(request: Request, { params }: Params) {
  const { connectionId } = await params;

  try {
    const body = await request.json();
    const sourceConnectionId: string | undefined = body.sourceConnectionId;
    const tableIds: string[] = Array.isArray(body.tableIds) ? body.tableIds : [];

    if (!sourceConnectionId) {
      return NextResponse.json({ error: "sourceConnectionId is required" }, { status: 400 });
    }
    if (sourceConnectionId === connectionId) {
      return NextResponse.json({ error: "Source and target connection must be different" }, { status: 400 });
    }
    if (tableIds.length === 0) {
      return NextResponse.json({ error: "Select at least one table to import" }, { status: 400 });
    }

    const sourceRows = await controlQuery(
      `SELECT table_id, display_name, description, icon, color, primary_key
       FROM v3_t_dbexplorer_data_sources
       WHERE connection_id = $1 AND table_id = ANY($2::text[])`,
      [sourceConnectionId, tableIds]
    );

    const imported: string[] = [];
    const skippedExisting: string[] = [];
    const skippedMissing: string[] = [];

    for (const row of sourceRows.rows) {
      const existsCheck = await queryConnection(
        connectionId,
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
        [row.table_id]
      );
      if ((existsCheck.rowCount ?? 0) === 0) {
        skippedMissing.push(row.table_id);
        continue;
      }

      const result = await controlQuery(
        `INSERT INTO v3_t_dbexplorer_data_sources (connection_id, connection_name, table_id, display_name, description, icon, color, primary_key)
         VALUES ($1, (SELECT name FROM v3_t_dbexplorer_connections WHERE id = $1), $2, $3, $4, $5, $6, $7)
         ON CONFLICT (connection_id, table_id) DO NOTHING`,
        [connectionId, row.table_id, row.display_name, row.description, row.icon, row.color, row.primary_key]
      );

      if (result.rowCount && result.rowCount > 0) imported.push(row.table_id);
      else skippedExisting.push(row.table_id);
    }

    return NextResponse.json({ imported, skippedExisting, skippedMissing });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
