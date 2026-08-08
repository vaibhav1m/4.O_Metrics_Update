import { Pool } from 'pg';

// This pool is the "control plane" — it holds Database Explorer's own
// admin_* tables (connections, data sources, users, audit log) and also
// doubles as the system connection's data pool (see src/lib/connections.ts).
export const pool = new Pool({
  host: process.env.SQL_HOST,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB,
  port: parseInt(process.env.SQL_PORT || '5432', 10),
  // Add some connection limits if needed
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
}
