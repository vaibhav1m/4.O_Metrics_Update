import { NextResponse } from "next/server";
import { queryConnection } from "@/lib/connections";
import { query as controlQuery } from "@/lib/db";
import { getRequestUser } from "@/lib/currentUser";
import { buildImportPlan, isImportPlanError } from "@/lib/importPlan";

const BATCH_SIZE = 500;

// Copies row *data* from a table on another connection into this table — e.g.
// "bring the rows from UAE's v3_t_master_platforms into System's copy". Only
// works between tables that are each already registered as a data source (so
// this can't be used to reach an arbitrary, un-whitelisted table). Existing
// rows (matched by the target's primary key) are left untouched — this only
// adds rows that don't already exist, it never overwrites.
//
// Optional `filters` narrow which source rows are considered, e.g.
// [{ column: "status", values: ["ACTIVE", "PAUSED"] }] — each becomes
// `"column" = ANY(...)`, ANDed together in the WHERE clause. See
// import/preview/route.ts for a read-only, paginated look at the same plan.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  const { connectionId, tableName } = await params;

  try {
    const body = await request.json();
    const plan = await buildImportPlan({
      connectionId,
      tableName,
      sourceConnectionId: body.sourceConnectionId,
      sourceTableId: body.sourceTableId,
      rawFilters: body.filters,
    });
    if (isImportPlanError(plan)) {
      return NextResponse.json({ error: plan.error }, { status: plan.status });
    }

    const { sharedColumns, columnList, targetSchema, newRows, sourceTotal, existingCount } = plan;

    let imported = 0;
    for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
      const batch = newRows.slice(i, i + BATCH_SIZE);
      const values: any[] = [];
      const rowPlaceholders = batch.map((row: any) => {
        const placeholders = sharedColumns.map((col: string) => {
          const val = row[col];
          values.push(typeof val === "object" && val !== null ? JSON.stringify(val) : val);
          return `$${values.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });

      await queryConnection(
        connectionId,
        `INSERT INTO "${targetSchema}"."${tableName}" (${columnList}) VALUES ${rowPlaceholders.join(", ")}`,
        values
      );
      imported += batch.length;
    }

    await controlQuery(
      `INSERT INTO v3_t_dbexplorer_audit_logs (connection_id, table_name, action, record_pk, after_data, changed_by)
       VALUES ($1, $2, 'insert', NULL, $3, $4)`,
      [connectionId, tableName, JSON.stringify({ importedFrom: { connectionId: body.sourceConnectionId, tableId: body.sourceTableId }, filters: body.filters, rowsImported: imported }), await getRequestUser(request)]
    ).catch(() => {});

    return NextResponse.json({
      sourceTotal,
      imported,
      skippedExisting: existingCount,
      columns: sharedColumns,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
