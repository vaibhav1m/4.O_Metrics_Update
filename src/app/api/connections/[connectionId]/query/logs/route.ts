import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";

const PAGE_SIZE = 50;

// History of statements run through the Query Console for this connection.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const [rowsResult, countResult] = await Promise.all([
      controlQuery(
        `SELECT id, sql_text, statement_kind, status, row_count, duration_ms, error_message, created_at
         FROM v3_t_dbexplorer_query_logs
         WHERE connection_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [connectionId, PAGE_SIZE, offset]
      ),
      controlQuery("SELECT COUNT(*) FROM v3_t_dbexplorer_query_logs WHERE connection_id = $1", [connectionId]),
    ]);

    return NextResponse.json({
      logs: rowsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit: PAGE_SIZE,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  try {
    const result = await controlQuery(
      "DELETE FROM v3_t_dbexplorer_query_logs WHERE connection_id = $1",
      [connectionId]
    );
    return NextResponse.json({ deleted: result.rowCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
