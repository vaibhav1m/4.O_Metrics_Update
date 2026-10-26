import { NextResponse } from "next/server";
import { query as controlQuery } from "@/lib/db";
import { getRequestUser } from "@/lib/currentUser";

type Params = { params: Promise<{ connectionId: string }> };

const noUser = () => NextResponse.json({ error: "Set your name first — folders are per user" }, { status: 401 });

// The current user's folders on this connection, each with the ids of the data
// sources inside it.
export async function GET(request: Request, { params }: Params) {
  const { connectionId } = await params;
  const user = getRequestUser(request);
  if (!user) return noUser();

  const result = await controlQuery(
    `SELECT f.id, f.name, f.created_at,
            COALESCE(array_agg(ft.data_source_id ORDER BY ft.added_at) FILTER (WHERE ft.data_source_id IS NOT NULL), '{}') AS data_source_ids
       FROM v3_t_dbexplorer_folders f
       LEFT JOIN v3_t_dbexplorer_folder_tables ft ON ft.folder_id = f.id
      WHERE f.connection_id = $1 AND f.owner_username = $2
      GROUP BY f.id
      ORDER BY lower(f.name)`,
    [connectionId, user]
  );
  return NextResponse.json(result.rows);
}

export async function POST(request: Request, { params }: Params) {
  const { connectionId } = await params;
  const user = getRequestUser(request);
  if (!user) return noUser();

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });

    const result = await controlQuery(
      `INSERT INTO v3_t_dbexplorer_folders (connection_id, owner_username, name)
       VALUES ($1, $2, $3) RETURNING id, name, created_at`,
      [connectionId, user, name]
    );
    return NextResponse.json({ data: { ...result.rows[0], data_source_ids: [] } }, { status: 201 });
  } catch (error: any) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already have a folder with that name" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
