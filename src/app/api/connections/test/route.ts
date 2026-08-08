import { NextResponse } from "next/server";
import { Pool } from "pg";

// Ad-hoc test for a connection that hasn't been saved yet (Add Connection modal).
export async function POST(request: Request) {
  try {
    const { host, port, database_name, username, password } = await request.json();
    if (!host || !port || !database_name || !username) {
      return NextResponse.json({ ok: false, error: "Missing connection details" }, { status: 400 });
    }

    const testPool = new Pool({
      host,
      port: Number(port),
      database: database_name,
      user: username,
      password,
      connectionTimeoutMillis: 5000,
      max: 1,
    });

    try {
      await testPool.query("SELECT 1");
    } finally {
      await testPool.end();
    }

    return NextResponse.json({ ok: true, message: "Connection successful" });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
}
