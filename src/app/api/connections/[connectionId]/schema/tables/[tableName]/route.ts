import { NextResponse } from "next/server";
import { queryConnection } from "@/lib/connections";
import { isValidIdentifier } from "@/lib/dataSource";

// Columns + the real primary key (if Postgres has one on record) for a table
// that isn't registered as a data source yet — used to pre-fill (and require
// confirming) the primary key when adding a table discovered via schema fetch.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  const { connectionId, tableName } = await params;
  const { searchParams } = new URL(request.url);
  const schemaName = searchParams.get("schema") || "public";

  if (!isValidIdentifier(tableName) || !isValidIdentifier(schemaName)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }

  try {
    const [columnsResult, pkResult] = await Promise.all([
      queryConnection(connectionId, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schemaName, tableName]),
      queryConnection(connectionId, `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
        LIMIT 1
      `, [schemaName, tableName]),
    ]);

    if (columnsResult.rowCount === 0) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    return NextResponse.json({
      columns: columnsResult.rows.map((r: any) => r.column_name),
      detectedPrimaryKey: pkResult.rows[0]?.column_name ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
