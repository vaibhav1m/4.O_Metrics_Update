import { NextResponse } from "next/server";
import { queryConnection } from "@/lib/connections";
import { getDataSource } from "@/lib/dataSource";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  const { connectionId, tableName } = await params;

  const dataSource = await getDataSource(connectionId, tableName);
  if (!dataSource) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const column = searchParams.get("column");

  if (!column || !/^[a-zA-Z0-9_]+$/.test(column)) {
    return NextResponse.json({ error: "Invalid column" }, { status: 400 });
  }

  try {
    let sql: string;
    let resultColumn: string;

    if (column === "platform_name") {
      // platform_name is a virtual JOIN column — query the source table directly
      sql = `SELECT DISTINCT platform FROM public.v3_t_master_platforms WHERE platform IS NOT NULL ORDER BY platform LIMIT 500`;
      resultColumn = "platform";
    } else {
      const schemaName = dataSource.schema_name || "public";
      sql = `SELECT DISTINCT "${column}" FROM "${schemaName}"."${tableName}" WHERE "${column}" IS NOT NULL ORDER BY "${column}" LIMIT 500`;
      resultColumn = column;
    }

    const result = await queryConnection(connectionId, sql, []);
    const values = result.rows.map((r: any) => {
      const v = r[resultColumn];
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    });
    return NextResponse.json({ values });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
