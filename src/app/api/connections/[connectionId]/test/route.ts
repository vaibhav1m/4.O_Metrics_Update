import { NextResponse } from "next/server";
import { Pool } from "pg";
import { query as controlQuery } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

// Re-test a connection that's already saved, using its stored (decrypted) credentials.
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;

  try {
    const result = await controlQuery(
      "SELECT host, port, database_name, username, password_encrypted FROM v3_t_dbexplorer_connections WHERE id = $1",
      [connectionId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    const row = result.rows[0];

    const testPool = new Pool({
      host: row.host,
      port: row.port,
      database: row.database_name,
      user: row.username,
      password: row.password_encrypted ? decrypt(row.password_encrypted) : undefined,
      connectionTimeoutMillis: 5000,
      max: 1,
    });

    try {
      await testPool.query("SELECT 1");
    } finally {
      await testPool.end();
    }

    await controlQuery("UPDATE v3_t_dbexplorer_connections SET last_tested_at = now(), last_test_ok = true WHERE id = $1", [connectionId]);
    return NextResponse.json({ ok: true, message: "Connection successful" });
  } catch (error: any) {
    await controlQuery(
      "UPDATE v3_t_dbexplorer_connections SET last_tested_at = now(), last_test_ok = false WHERE id = $1",
      [connectionId]
    ).catch(() => {});
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
}
