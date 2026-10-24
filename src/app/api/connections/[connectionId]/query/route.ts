import { NextResponse } from "next/server";
import { getPoolFor } from "@/lib/connections";
import { query as controlQuery } from "@/lib/db";
import { classifyStatement } from "@/lib/sqlSafety";

const STATEMENT_TIMEOUT_MS = 30000;
const MAX_RETURNED_ROWS = 500;

async function logQuery(opts: {
  connectionId: string;
  sql: string;
  kind: "read" | "write";
  status: "success" | "error";
  rowCount: number | null;
  durationMs: number;
  errorMessage: string | null;
}) {
  try {
    await controlQuery(
      `INSERT INTO v3_t_dbexplorer_query_logs
         (connection_id, connection_name, sql_text, statement_kind, status, row_count, duration_ms, error_message)
       VALUES ($1, (SELECT name FROM v3_t_dbexplorer_connections WHERE id = $1), $2, $3, $4, $5, $6, $7)`,
      [opts.connectionId, opts.sql, opts.kind, opts.status, opts.rowCount, opts.durationMs, opts.errorMessage]
    );
  } catch (err) {
    console.error("Failed to write query log", err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  let sql = "";
  let kind: "read" | "write" = "write";
  const started = Date.now();

  try {
    const body = await request.json();
    sql = typeof body.sql === "string" ? body.sql : "";
    const confirmed = body.confirmed === true;

    if (!sql.trim()) {
      return NextResponse.json({ error: "No SQL provided" }, { status: 400 });
    }

    kind = classifyStatement(sql);

    // The confirmation gate is enforced here, not just in the UI — a client that
    // skips the dialog still can't run a write without explicitly asking for it.
    if (kind === "write" && !confirmed) {
      return NextResponse.json(
        {
          requiresConfirmation: true,
          statementKind: kind,
          message: "This statement may modify data or schema. Re-run with confirmation to execute it.",
        },
        { status: 409 }
      );
    }

    const pool = await getPoolFor(connectionId);
    const client = await pool.connect();

    try {
      await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const raw = await client.query({ text: sql, rowMode: "array" });

      // Multi-statement submissions come back as an array of results; surface the
      // last one that produced rows, falling back to the last result overall.
      const results = Array.isArray(raw) ? raw : [raw];
      const withRows = [...results].reverse().find((r: any) => r?.fields?.length > 0);
      const result: any = withRows ?? results[results.length - 1];

      const fields: string[] = (result?.fields ?? []).map((f: any) => f.name);
      const allRows: any[][] = result?.rows ?? [];
      const rows = allRows.slice(0, MAX_RETURNED_ROWS);
      const durationMs = Date.now() - started;

      await logQuery({
        connectionId,
        sql,
        kind,
        status: "success",
        rowCount: typeof result?.rowCount === "number" ? result.rowCount : allRows.length,
        durationMs,
        errorMessage: null,
      });

      return NextResponse.json({
        statementKind: kind,
        command: result?.command ?? null,
        columns: fields,
        rows: rows.map(r => r.map((v: any) => (v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : String(v)))),
        rowCount: typeof result?.rowCount === "number" ? result.rowCount : allRows.length,
        returnedRows: rows.length,
        truncated: allRows.length > rows.length,
        durationMs,
        statementCount: results.length,
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    const durationMs = Date.now() - started;
    if (sql.trim()) {
      await logQuery({
        connectionId,
        sql,
        kind,
        status: "error",
        rowCount: null,
        durationMs,
        errorMessage: error.message,
      });
    }
    return NextResponse.json({ error: error.message, durationMs }, { status: 400 });
  }
}
