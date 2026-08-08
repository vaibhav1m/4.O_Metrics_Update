import { NextResponse } from "next/server";
import { queryConnection } from "@/lib/connections";
import { getDataSource, isValidIdentifier } from "@/lib/dataSource";
import { query as controlQuery } from "@/lib/db";

type Params = { params: Promise<{ connectionId: string; tableName: string }> };

async function resolveParams(paramsPromise: Params["params"]) {
  const { connectionId, tableName } = await paramsPromise;
  return { connectionId, tableName };
}

interface ColumnFilter {
  column: string;
  values: string[];
}

function parseColumnFilters(raw: string | null): ColumnFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f: any) => f && typeof f.column === "string" && Array.isArray(f.values) && f.values.length > 0);
  } catch {
    return [];
  }
}

async function logAudit(
  connectionId: string,
  tableName: string,
  action: "insert" | "update" | "delete",
  recordPk: string | null,
  before: any,
  after: any
) {
  try {
    // changed_by is left null until login is reimplemented.
    await controlQuery(
      `INSERT INTO v3_t_dbexplorer_audit_logs (connection_id, table_name, action, record_pk, before_data, after_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [connectionId, tableName, action, recordPk, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
    );
  } catch (err) {
    console.error("Failed to write audit log", err);
  }
}

export async function GET(request: Request, { params }: Params) {
  const { connectionId, tableName } = await resolveParams(params);

  const dataSource = await getDataSource(connectionId, tableName);
  if (!dataSource) {
    return NextResponse.json({ error: "Invalid or unconfigured table name" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;
    const primaryKey = dataSource.primary_key || "id";

    const schemaQuery = await queryConnection(connectionId, `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
    `, [tableName]);

    if (schemaQuery.rowCount === 0) {
      return NextResponse.json({ error: "Table does not exist in database" }, { status: 404 });
    }

    const tableColumns = schemaQuery.rows.map((r: any) => r.column_name);
    const hasPlatformId = tableColumns.includes("platform_id");

    // Only join the platform lookup table if it actually exists on this connection.
    let joinPlatform = false;
    if (hasPlatformId) {
      const platformTableCheck = await queryConnection(connectionId, `
        SELECT 1 FROM information_schema.tables WHERE table_name = 'v3_t_master_platforms' LIMIT 1
      `);
      joinPlatform = (platformTableCheck.rowCount ?? 0) > 0;
    }

    const hasTimestamp = tableColumns.includes("created_time_stamp");

    // The base table is always aliased "t" so filter/order-by column references
    // stay consistent whether or not the platform join is present.
    const fromClause = joinPlatform
      ? `public."${tableName}" t LEFT JOIN public.v3_t_master_platforms p ON t.platform_id = p.platform_id`
      : `public."${tableName}" t`;

    // Column filters (from the grid's per-column checkbox filters). Silently
    // drop anything that isn't a real column on this table — "platform_name"
    // is the one virtual exception, valid only when the platform join is active.
    const rawFilters = parseColumnFilters(searchParams.get("filters"));
    const validFilters = rawFilters.filter(f =>
      isValidIdentifier(f.column) &&
      (tableColumns.includes(f.column) || (f.column === "platform_name" && joinPlatform))
    );

    const filterValues: any[] = [];
    const filterClauses = validFilters.map(f => {
      const colRef = f.column === "platform_name" ? "p.platform" : `t."${f.column}"`;
      filterValues.push(f.values.map(String));
      return `${colRef}::text = ANY($${filterValues.length}::text[])`;
    });
    const whereClause = filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : "";

    const countResult = await queryConnection(
      connectionId,
      `SELECT COUNT(*) FROM ${fromClause} ${whereClause}`,
      filterValues
    );
    const total = parseInt(countResult.rows[0].count);

    const orderParts: string[] = [];
    if (hasTimestamp) orderParts.push(`t."created_time_stamp" DESC NULLS LAST`);
    orderParts.push(`t."${primaryKey}" DESC`);
    const orderBy = orderParts.join(", ");

    const selectCols = joinPlatform ? "t.*, p.platform as platform_name" : "t.*";
    const sql = `
      SELECT ${selectCols}
      FROM ${fromClause}
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}
    `;

    const dataResult = await queryConnection(connectionId, sql, [...filterValues, limit, offset]);

    return NextResponse.json({
      data: dataResult.rows,
      columns: tableColumns,
      hasPlatformId: joinPlatform,
      primaryKey,
      total,
      page,
      limit,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const { connectionId, tableName } = await resolveParams(params);

  const dataSource = await getDataSource(connectionId, tableName);
  if (!dataSource) {
    return NextResponse.json({ error: "Invalid or unconfigured table name" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const primaryKey = dataSource.primary_key || "id";
    delete body[primaryKey];
    delete body["platform_name"];

    const keys = Object.keys(body);
    const values = Object.values(body).map(val => {
      if (typeof val === "object" && val !== null) return JSON.stringify(val);
      if (typeof val === "string" && val === "") return null;
      return val;
    });

    if (keys.length === 0) return NextResponse.json({ error: "No data provided" }, { status: 400 });

    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const columns = keys.map(k => `"${k}"`).join(", ");

    const sql = `INSERT INTO public."${tableName}" (${columns}) VALUES (${placeholders}) RETURNING *`;
    const result = await queryConnection(connectionId, sql, values);
    const created = result.rows[0];

    await logAudit(connectionId, tableName, "insert", created?.[primaryKey] != null ? String(created[primaryKey]) : null, null, created);

    return NextResponse.json({ data: created, message: "Record created successfully" }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { connectionId, tableName } = await resolveParams(params);

  const dataSource = await getDataSource(connectionId, tableName);
  if (!dataSource) {
    return NextResponse.json({ error: "Invalid or unconfigured table name" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const primaryKey = dataSource.primary_key || "id";
    const idValue = body[primaryKey];

    if (!idValue) return NextResponse.json({ error: `${primaryKey} is required for updating` }, { status: 400 });

    const beforeResult = await queryConnection(connectionId, `SELECT * FROM public."${tableName}" WHERE "${primaryKey}" = $1`, [idValue]);
    const before = beforeResult.rows[0] || null;

    const updateData = { ...body };
    delete updateData[primaryKey];
    delete updateData["platform_name"];

    const keys = Object.keys(updateData);
    const values = Object.values(updateData).map(val => {
      if (typeof val === "object" && val !== null) return JSON.stringify(val);
      if (typeof val === "string" && val === "") return null;
      return val;
    });

    if (keys.length === 0) return NextResponse.json({ error: "No data to update" }, { status: 400 });

    const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
    values.push(idValue);

    const sql = `UPDATE public."${tableName}" SET ${setClause} WHERE "${primaryKey}" = $${values.length} RETURNING *`;
    const result = await queryConnection(connectionId, sql, values);

    if (result.rowCount === 0) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    const after = result.rows[0];
    await logAudit(connectionId, tableName, "update", String(idValue), before, after);

    return NextResponse.json({ data: after, message: "Record updated successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { connectionId, tableName } = await resolveParams(params);

  const dataSource = await getDataSource(connectionId, tableName);
  if (!dataSource) {
    return NextResponse.json({ error: "Invalid or unconfigured table name" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const primaryKey = dataSource.primary_key || "id";
    const idValue = searchParams.get("id");

    if (!idValue) return NextResponse.json({ error: "Query parameter 'id' is required" }, { status: 400 });

    const sql = `DELETE FROM public."${tableName}" WHERE "${primaryKey}" = $1 RETURNING *`;
    const result = await queryConnection(connectionId, sql, [idValue]);

    if (result.rowCount === 0) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    await logAudit(connectionId, tableName, "delete", idValue, result.rows[0], null);

    return NextResponse.json({ message: "Record deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
