import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

const PUBLIC_COLUMNS = `id, name, type, host, port, database_name, username, extra_params, is_active, last_tested_at, last_test_ok, created_at, updated_at`;

export async function GET() {
  const result = await controlQuery(
    `SELECT ${PUBLIC_COLUMNS} FROM v3_t_dbexplorer_connections ORDER BY name`,
    []
  );
  return NextResponse.json(result.rows);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, host, port, database_name, username, password } = body;

    if (!name || !type || !host || !port || !database_name || !username) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (type !== "postgres") {
      return NextResponse.json({ error: "Only PostgreSQL connections are supported right now" }, { status: 400 });
    }

    const passwordEncrypted = password ? encrypt(password) : null;

    const result = await controlQuery(
      `INSERT INTO v3_t_dbexplorer_connections (name, type, host, port, database_name, username, password_encrypted)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${PUBLIC_COLUMNS}`,
      [name, type, host, Number(port), database_name, username, passwordEncrypted]
    );

    return NextResponse.json({ data: result.rows[0], message: "Connection created" }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
