const { Pool } = require('pg');

const pool = new Pool({
  host: '103.68.8.229',
  user: 'postgres',
  password: 'YUFNagbdeRwpoLebUWZf',
  database: 'infytrix',
  port: 5432,
});

async function run() {
  try {
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'v3_t_master_platforms'");
    console.log("Columns for v3_t_master_platforms:");
    console.table(res.rows);
    pool.end();
  } catch(e) {
    console.error(e);
  }
}
run();
