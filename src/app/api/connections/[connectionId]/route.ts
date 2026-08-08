import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

const PUBLIC_COLUMNS = `id, name, type, host, port, database_name, username, extra_params, is_active, last_tested_at, last_test_ok, created_at, updated_at`;

type Params = { params: Promise<{ connectionId: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { connectionId } = await params;

  try {
    const existing = await controlQuery("SELECT id FROM v3_t_dbexplorer_connections WHERE id = $1", [connectionId]);
    if (existing.rowCount === 0) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    const body = await request.json();
    const { name, host, port, database_name, username, password, is_active } = body;

    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); values.push(name); }
    if (host !== undefined) { sets.push(`host = $${i++}`); values.push(host); }
    if (port !== undefined) { sets.push(`port = $${i++}`); values.push(Number(port)); }
    if (database_name !== undefined) { sets.push(`database_name = $${i++}`); values.push(database_name); }
    if (username !== undefined) { sets.push(`username = $${i++}`); values.push(username); }
    if (password) { sets.push(`password_encrypted = $${i++}`); values.push(encrypt(password)); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); values.push(is_active); }

    if (sets.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    sets.push(`updated_at = now()`);

    values.push(connectionId);
    const sql = `UPDATE v3_t_dbexplorer_connections SET ${sets.join(", ")} WHERE id = $${i} RETURNING ${PUBLIC_COLUMNS}`;
    const result = await controlQuery(sql, values);

    // Keep the denormalized connection_name on data sources in sync.
    if (name !== undefined) {
      await controlQuery(
        "UPDATE v3_t_dbexplorer_data_sources SET connection_name = $1 WHERE connection_id = $2",
        [name, connectionId]
      );
    }

    return NextResponse.json({ data: result.rows[0], message: "Connection updated" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { connectionId } = await params;

  const existing = await controlQuery("SELECT id FROM v3_t_dbexplorer_connections WHERE id = $1", [connectionId]);
  if (existing.rowCount === 0) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  await controlQuery("DELETE FROM v3_t_dbexplorer_connections WHERE id = $1", [connectionId]);
  return NextResponse.json({ message: "Connection deleted" });
}
