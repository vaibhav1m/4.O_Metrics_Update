// One-time / idempotent setup for Database Explorer's control-plane schema.
//
// What it does, in order:
//   1. Ensures ENCRYPTION_KEY exists in .env.local (generates + appends if missing).
//   2. Runs every migrations/*.sql file, in filename order, against the control Postgres
//      DB (SQL_HOST/... in .env.local).
//   3. Registers the control DB itself as a normal connection named "Infytrix", if not
//      already present — with its password encrypted and stored like any other
//      connection (there is no special "system" connection anymore).
//   4. Registers SQL_*_TEMP / SQL_*_UAE as additional connections, if those env vars are
//      set and not already registered.
//   5. Imports src/data/tables.json into v3_t_dbexplorer_data_sources under the Infytrix
//      connection.
//
// Usage: npm run db:migrate

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const envPath = path.join(rootDir, ".env.local");

dotenv.config({ path: envPath, quiet: true });

function ensureEnvVar(name, generator) {
  if (process.env[name]) return false;
  const value = generator();
  fs.appendFileSync(envPath, `\n${name}=${value}\n`);
  process.env[name] = value;
  console.log(`Generated ${name} and appended it to .env.local`);
  return true;
}

ensureEnvVar("ENCRYPTION_KEY", () => crypto.randomBytes(32).toString("base64"));

// Mirrors src/lib/crypto.ts's encrypt() — duplicated here since this is a plain
// Node script and can't import the app's TypeScript module directly.
function encrypt(plaintext) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

const pool = new Pool({
  host: process.env.SQL_HOST,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB,
  port: parseInt(process.env.SQL_PORT || "5432", 10),
});

async function main() {
  console.log(`Connecting to control database ${process.env.SQL_DB}@${process.env.SQL_HOST}...`);

  const migrationsDir = path.join(rootDir, "migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  for (const file of migrationFiles) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), "utf-8"));
    console.log(`✓ Applied ${file}`);
  }

  // 1. The control DB itself, registered as a normal, fully editable connection.
  const infytrixConn = await pool.query(
    "SELECT id FROM v3_t_dbexplorer_connections WHERE host = $1 AND database_name = $2 AND username = $3",
    [process.env.SQL_HOST, process.env.SQL_DB, process.env.SQL_USER]
  );
  let infytrixConnectionId;
  if (infytrixConn.rowCount === 0) {
    const result = await pool.query(
      `INSERT INTO v3_t_dbexplorer_connections (name, type, host, port, database_name, username, password_encrypted)
       VALUES ($1, 'postgres', $2, $3, $4, $5, $6) RETURNING id`,
      [
        "Infytrix",
        process.env.SQL_HOST,
        parseInt(process.env.SQL_PORT || "5432", 10),
        process.env.SQL_DB,
        process.env.SQL_USER,
        process.env.SQL_PASSWORD ? encrypt(process.env.SQL_PASSWORD) : null,
      ]
    );
    infytrixConnectionId = result.rows[0].id;
    console.log(`✓ Registered "Infytrix" connection (id ${infytrixConnectionId})`);
  } else {
    infytrixConnectionId = infytrixConn.rows[0].id;
    console.log('✓ "Infytrix" connection already registered, skipping');
  }

  // 2. Extra connections already present as *_TEMP / *_UAE env vars
  const extraSuffixes = [
    { suffix: "TEMP", name: "Temp" },
    { suffix: "UAE", name: "UAE" },
  ];

  for (const { suffix, name } of extraSuffixes) {
    const host = process.env[`SQL_HOST_${suffix}`];
    const user = process.env[`SQL_USER_${suffix}`];
    const password = process.env[`SQL_PASSWORD_${suffix}`];
    const db = process.env[`SQL_DB_${suffix}`];
    const port = process.env[`SQL_PORT_${suffix}`];

    if (!host || !user || !db) continue;

    const existing = await pool.query(
      "SELECT id FROM v3_t_dbexplorer_connections WHERE host = $1 AND database_name = $2 AND username = $3",
      [host, db, user]
    );
    if (existing.rowCount > 0) {
      console.log(`✓ Connection "${name}" already registered, skipping`);
      continue;
    }

    await pool.query(
      `INSERT INTO v3_t_dbexplorer_connections (name, type, host, port, database_name, username, password_encrypted)
       VALUES ($1, 'postgres', $2, $3, $4, $5, $6)`,
      [name, host, parseInt(port || "5432", 10), db, user, password ? encrypt(password) : null]
    );
    console.log(`✓ Registered connection "${name}"`);
  }

  // 3. Import tables.json into v3_t_dbexplorer_data_sources under the Infytrix connection
  const tablesJsonPath = path.join(rootDir, "src", "data", "tables.json");
  if (fs.existsSync(tablesJsonPath)) {
    const entries = JSON.parse(fs.readFileSync(tablesJsonPath, "utf-8"));
    let imported = 0;
    for (const entry of entries) {
      const result = await pool.query(
        `INSERT INTO v3_t_dbexplorer_data_sources (connection_id, connection_name, table_id, display_name, description, icon, color, primary_key)
         VALUES ($1, (SELECT name FROM v3_t_dbexplorer_connections WHERE id = $1), $2, $3, $4, $5, $6, $7)
         ON CONFLICT (connection_id, table_id) DO NOTHING`,
        [
          infytrixConnectionId,
          entry.id,
          entry.name,
          entry.desc || "",
          entry.icon || "Database",
          entry.color || "#60a5fa",
          entry.primaryKey || "id",
        ]
      );
      if (result.rowCount > 0) imported++;
    }
    console.log(`✓ Imported ${imported}/${entries.length} table configs from tables.json`);
  }

  console.log("\nDone. Start the app with `npm run dev`.");
}

main()
  .catch(err => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
