import { queryConnection } from "./connections";
import { getDataSource, isValidIdentifier } from "./dataSource";

export interface ImportFilter {
  column: string;
  values: string[];
}

export interface ImportPlan {
  sharedColumns: string[];
  columnList: string; // quoted, comma-joined shared columns, ready to drop into SQL
  targetPk: string;
  sourceTotal: number; // rows matching the filter, before excluding ones that already exist
  newRows: any[]; // rows matching the filter whose PK isn't already present in the target
  existingCount: number;
}

export interface ImportPlanError {
  error: string;
  status: number;
}

const MAX_SOURCE_ROWS = 10000;

// Shared by the actual import and the preview endpoint: resolves which source
// rows match the requested filters and which of those are actually new (not
// already present in the target table by primary key). Read-only — callers
// decide whether to insert `newRows` or just display them.
export async function buildImportPlan(opts: {
  connectionId: string;
  tableName: string;
  sourceConnectionId: string;
  sourceTableId: string;
  rawFilters: unknown;
}): Promise<ImportPlan | ImportPlanError> {
  const { connectionId, tableName, sourceConnectionId, sourceTableId, rawFilters } = opts;

  if (!sourceConnectionId || !sourceTableId) {
    return { error: "sourceConnectionId and sourceTableId are required", status: 400 };
  }
  if (sourceConnectionId === connectionId && sourceTableId === tableName) {
    return { error: "Source and target table must be different", status: 400 };
  }

  const targetSource = await getDataSource(connectionId, tableName);
  if (!targetSource) return { error: "Target table is not configured", status: 400 };

  const sourceSource = await getDataSource(sourceConnectionId, sourceTableId);
  if (!sourceSource) return { error: "Source table is not configured on the source connection", status: 400 };

  const [targetCols, sourceCols] = await Promise.all([
    queryConnection(connectionId, "SELECT column_name FROM information_schema.columns WHERE table_name = $1", [tableName]),
    queryConnection(sourceConnectionId, "SELECT column_name FROM information_schema.columns WHERE table_name = $1", [sourceTableId]),
  ]);

  const sourceColSet = new Set(sourceCols.rows.map((r: any) => r.column_name));
  const targetColSet = new Set(targetCols.rows.map((r: any) => r.column_name));
  const sharedColumns = sourceCols.rows.map((r: any) => r.column_name).filter((c: string) => targetColSet.has(c));

  const targetPk = targetSource.primary_key;
  if (!sharedColumns.includes(targetPk)) {
    return { error: `Primary key "${targetPk}" isn't a shared column between these two tables`, status: 400 };
  }

  const filters: ImportFilter[] = (Array.isArray(rawFilters) ? rawFilters : [])
    .filter((f: any) => f && f.column && Array.isArray(f.values) && f.values.length > 0);

  for (const f of filters) {
    if (!isValidIdentifier(f.column)) return { error: `Invalid filter column "${f.column}"`, status: 400 };
    if (!sourceColSet.has(f.column)) return { error: `Column "${f.column}" does not exist on the source table`, status: 400 };
  }

  const whereValues: any[] = [];
  const whereClause = filters.length > 0
    ? "WHERE " + filters.map(f => {
        whereValues.push(f.values.map(String));
        return `"${f.column}"::text = ANY($${whereValues.length}::text[])`;
      }).join(" AND ")
    : "";

  const countResult = await queryConnection(sourceConnectionId, `SELECT COUNT(*) FROM public."${sourceTableId}" ${whereClause}`, whereValues);
  const sourceTotal = parseInt(countResult.rows[0].count, 10);
  if (sourceTotal > MAX_SOURCE_ROWS) {
    return { error: `Selection has ${sourceTotal} rows, which is over the ${MAX_SOURCE_ROWS} row import limit — narrow it with a filter`, status: 400 };
  }

  const columnList = sharedColumns.map((c: string) => `"${c}"`).join(", ");

  if (sourceTotal === 0) {
    return { sharedColumns, columnList, targetPk, sourceTotal: 0, newRows: [], existingCount: 0 };
  }

  const sourceRowsResult = await queryConnection(sourceConnectionId, `SELECT ${columnList} FROM public."${sourceTableId}" ${whereClause}`, whereValues);
  const sourceRows = sourceRowsResult.rows;

  const pkValues = sourceRows.map((r: any) => r[targetPk]);
  const existingResult = await queryConnection(
    connectionId,
    `SELECT "${targetPk}" FROM public."${tableName}" WHERE "${targetPk}"::text = ANY($1::text[])`,
    [pkValues.map((v: any) => String(v))]
  );
  const existingPks = new Set(existingResult.rows.map((r: any) => String(r[targetPk])));
  const newRows = sourceRows.filter((r: any) => !existingPks.has(String(r[targetPk])));

  return { sharedColumns, columnList, targetPk, sourceTotal: sourceRows.length, newRows, existingCount: sourceRows.length - newRows.length };
}

export function isImportPlanError(plan: ImportPlan | ImportPlanError): plan is ImportPlanError {
  return "error" in plan;
}
