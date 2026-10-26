import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";
import { getRequestUser } from "@/lib/currentUser";

type Params = { params: Promise<{ connectionId: string; folderId: string }> };

const noUser = () => NextResponse.json({ error: "Set your name first — folders are per user" }, { status: 401 });

// Rename. Scoped by owner, so one user can't touch another's folder.
export async function PUT(request: Request, { params }: Params) {
  const { connectionId, folderId } = await params;
  const user = getRequestUser(request);
  if (!user) return noUser();

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });

    const result = await controlQuery(
      `UPDATE v3_t_dbexplorer_folders SET name = $1, updated_at = now()
        WHERE id = $2 AND connection_id = $3 AND owner_username = $4
        RETURNING id, name`,
      [name, folderId, connectionId, user]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    return NextResponse.json({ data: result.rows[0] });
  } catch (error: any) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already have a folder with that name" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Deletes the folder and its links (ON DELETE CASCADE) — never the tables' configs.
export async function DELETE(request: Request, { params }: Params) {
  const { connectionId, folderId } = await params;
  const user = getRequestUser(request);
  if (!user) return noUser();

  const result = await controlQuery(
    "DELETE FROM v3_t_dbexplorer_folders WHERE id = $1 AND connection_id = $2 AND owner_username = $3",
    [folderId, connectionId, user]
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  return NextResponse.json({ message: "Folder deleted" });
}
