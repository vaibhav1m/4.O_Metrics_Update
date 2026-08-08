import { NextResponse } from "next/server";
import { queryConnection } from "@/lib/connections";
import { query as controlQuery } from "@/lib/db";
import { isReservedTableId } from "@/lib/dataSource";

// Lists real tables in this connection's database that aren't already
// registered as a data source here — the candidate pool for "fetch tables
// from database" in the Add Table Configuration modal.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  try {
    const [tablesResult, configuredResult] = await Promise.all([
      queryConnection(connectionId, `
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `, []),
      controlQuery("SELECT table_id FROM v3_t_dbexplorer_data_sources WHERE connection_id = $1", [connectionId]),
    ]);

    const configured = new Set(configuredResult.rows.map((r: any) => r.table_id));
    const tables = tablesResult.rows
      .map((r: any) => r.table_name as string)
      .filter(name => !configured.has(name) && !isReservedTableId(name));

    return NextResponse.json({ tables });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
