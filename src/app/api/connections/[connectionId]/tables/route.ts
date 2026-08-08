import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";
import { isValidIdentifier, isReservedTableId } from "@/lib/dataSource";

type Params = { params: Promise<{ connectionId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { connectionId } = await params;
  const result = await controlQuery(
    "SELECT * FROM v3_t_dbexplorer_data_sources WHERE connection_id = $1 ORDER BY sort_order, id",
    [connectionId]
  );
  return NextResponse.json(result.rows);
}

export async function POST(request: Request, { params }: Params) {
  const { connectionId } = await params;

  try {
    const body = await request.json();
    if (!body.table_id || !body.display_name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!isValidIdentifier(body.table_id)) {
      return NextResponse.json({ error: "Table name must contain only letters, numbers, and underscores" }, { status: 400 });
    }
    if (isReservedTableId(body.table_id)) {
      return NextResponse.json({ error: "This table is managed internally by Database Explorer and can't be added as a data source" }, { status: 400 });
    }
    if (body.primary_key && !isValidIdentifier(body.primary_key)) {
      return NextResponse.json({ error: "Primary key must contain only letters, numbers, and underscores" }, { status: 400 });
    }

    const result = await controlQuery(
      `INSERT INTO v3_t_dbexplorer_data_sources (connection_id, connection_name, table_id, display_name, description, icon, color, primary_key)
       VALUES ($1, (SELECT name FROM v3_t_dbexplorer_connections WHERE id = $1), $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        connectionId,
        body.table_id,
        body.display_name,
        body.description || "",
        body.icon || "Database",
        body.color || "#60a5fa",
        body.primary_key || "id",
      ]
    );

    return NextResponse.json({ data: result.rows[0], message: "Table configuration added" }, { status: 201 });
  } catch (error: any) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Table configuration already exists for this connection" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { connectionId } = await params;

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Data source id is required" }, { status: 400 });
    if (body.primary_key && !isValidIdentifier(body.primary_key)) {
      return NextResponse.json({ error: "Primary key must contain only letters, numbers, and underscores" }, { status: 400 });
    }

    const result = await controlQuery(
      `UPDATE v3_t_dbexplorer_data_sources
       SET display_name = $1, description = $2, icon = $3, color = $4, primary_key = $5
       WHERE id = $6 AND connection_id = $7 RETURNING *`,
      [
        body.display_name,
        body.description || "",
        body.icon || "Database",
        body.color || "#60a5fa",
        body.primary_key || "id",
        body.id,
        connectionId,
      ]
    );

    if (result.rowCount === 0) return NextResponse.json({ error: "Table configuration not found" }, { status: 404 });
    return NextResponse.json({ data: result.rows[0], message: "Table configuration updated" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { connectionId } = await params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Data source id is required" }, { status: 400 });

  const result = await controlQuery(
    "DELETE FROM v3_t_dbexplorer_data_sources WHERE id = $1 AND connection_id = $2 RETURNING *",
    [id, connectionId]
  );

  if (result.rowCount === 0) return NextResponse.json({ error: "Table configuration not found" }, { status: 404 });
  return NextResponse.json({ message: "Table configuration deleted" });
}
