import { Pool } from "pg";
import { query as controlQuery } from "./db";
import { decrypt } from "./crypto";

export interface ConnectionRow {
  id: string;
  name: string;
  type: "postgres" | "trino";
  host: string;
  port: number;
  database_name: string;
  username: string;
  password_encrypted: string | null;
  extra_params: Record<string, any>;
  is_active: boolean;
}

const pools = new Map<string, Pool>();

export async function getConnectionRow(connectionId: string): Promise<ConnectionRow> {
  const result = await controlQuery(
    "SELECT * FROM v3_t_dbexplorer_connections WHERE id = $1 AND is_active = true",
    [connectionId]
  );
  if (result.rowCount === 0) throw new Error("Connection not found or inactive");
  return result.rows[0];
}

export async function getPoolFor(connectionId: string): Promise<Pool> {
  const cached = pools.get(connectionId);
  if (cached) return cached;

  const conn = await getConnectionRow(connectionId);
  if (conn.type !== "postgres") {
    throw new Error(`Connection type "${conn.type}" is not supported yet`);
  }

  const pool = new Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database_name,
    user: conn.username,
    password: conn.password_encrypted ? decrypt(conn.password_encrypted) : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: conn.extra_params?.ssl ? true : undefined,
  });
  pools.set(connectionId, pool);
  return pool;
}

export async function queryConnection(connectionId: string, text: string, params?: any[]) {
  const pool = await getPoolFor(connectionId);
  return pool.query(text, params);
}
