import { NextResponse } from "next/server";
import { buildImportPlan, isImportPlanError } from "@/lib/importPlan";

const PREVIEW_PAGE_SIZE = 50;

// Read-only look at what an import would do: same filter/whitelist logic as
// the real import (see buildImportPlan), but instead of inserting anything it
// returns counts plus a paginated slice of the rows that would actually be
// added (rows already present in the target, by primary key, are excluded —
// this previews what changes, not the whole filtered source set).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  const { connectionId, tableName } = await params;

  try {
    const body = await request.json();
    const page = Math.max(1, parseInt(body.page) || 1);
    const limit = PREVIEW_PAGE_SIZE;

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

    const { sharedColumns, newRows, sourceTotal, existingCount } = plan;
    const start = (page - 1) * limit;
    const rows = newRows.slice(start, start + limit);

    return NextResponse.json({
      sourceTotal,
      willImport: newRows.length,
      alreadyExists: existingCount,
      columns: sharedColumns,
      page,
      limit,
      rows,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
