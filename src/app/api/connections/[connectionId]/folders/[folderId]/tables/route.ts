import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";
import { getRequestUser } from "@/lib/currentUser";

type Params = { params: Promise<{ connectionId: string; folderId: string }> };

const noUser = () => NextResponse.json({ error: "Not signed in" }, { status: 401 });

async function ownsFolder(folderId: string, connectionId: string, user: string): Promise<boolean> {
  const result = await controlQuery(
    "SELECT 1 FROM v3_t_dbexplorer_folders WHERE id = $1 AND connection_id = $2 AND owner_username = $3",
    [folderId, connectionId, user]
  );
  return (result.rowCount ?? 0) > 0;
}

// Body: { dataSourceIds: string[] }. Only data sources of this same connection
// are linked (the join filters out anything else); already-linked ones are a no-op.
export async function POST(request: Request, { params }: Params) {
  const { connectionId, folderId } = await params;
  const user = await getRequestUser(request);
  if (!user) return noUser();

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body.dataSourceIds) ? body.dataSourceIds.map(String) : [];
    if (ids.length === 0) return NextResponse.json({ error: "dataSourceIds is required" }, { status: 400 });
    if (!(await ownsFolder(folderId, connectionId, user))) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const result = await controlQuery(
      `INSERT INTO v3_t_dbexplorer_folder_tables (folder_id, data_source_id)
       SELECT $1, ds.id FROM v3_t_dbexplorer_data_sources ds
        WHERE ds.connection_id = $2 AND ds.id = ANY($3::uuid[])
       ON CONFLICT DO NOTHING`,
      [folderId, connectionId, ids]
    );
    return NextResponse.json({ added: result.rowCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ?dataSourceId=... — removes the table from this folder only.
export async function DELETE(request: Request, { params }: Params) {
  const { connectionId, folderId } = await params;
  const user = await getRequestUser(request);
  if (!user) return noUser();

  const dataSourceId = new URL(request.url).searchParams.get("dataSourceId");
  if (!dataSourceId) return NextResponse.json({ error: "dataSourceId is required" }, { status: 400 });
  if (!(await ownsFolder(folderId, connectionId, user))) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  await controlQuery(
    "DELETE FROM v3_t_dbexplorer_folder_tables WHERE folder_id = $1 AND data_source_id = $2",
    [folderId, dataSourceId]
  );
  return NextResponse.json({ message: "Removed from folder" });
}
