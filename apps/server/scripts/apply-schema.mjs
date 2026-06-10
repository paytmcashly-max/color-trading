import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply the database schema.");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(scriptDir, "../prisma/init.sql");
const migrationsPath = resolve(scriptDir, "../prisma/migrations");
const migrationLockId = 4_268_202_610;

const client = new Client({
  connectionString: databaseUrl,
  statement_timeout: 60_000,
  query_timeout: 60_000,
});

await client.connect();

try {
  await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
  await ensureMigrationLedger();
  await bootstrapSchemaIfNeeded();
  await applySqlMigrations();
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]).catch(() => undefined);
  await client.end();
}

async function ensureMigrationLedger() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
    )
  `);
}

async function bootstrapSchemaIfNeeded() {
  const existing = await client.query(
    "SELECT to_regclass('public.users') AS users_table",
  );

  if (existing.rows[0]?.users_table) {
    console.log("Database schema already exists; skipping init.sql.");
    return;
  }

  const sql = await readFile(schemaPath, "utf8");
  await client.query("BEGIN");

  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
      ["00000000_init.sql", checksum(sql)],
    );
    await client.query("COMMIT");
    console.log("Database schema applied from init.sql.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function applySqlMigrations() {
  const migrations = (await readdir(migrationsPath))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const sql = await readFile(resolve(migrationsPath, migration), "utf8");
    const sqlChecksum = checksum(sql);
    const existing = await client.query(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [migration],
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== sqlChecksum) {
        throw new Error(`Migration checksum changed after apply: ${migration}`);
      }

      console.log(`Database migration already applied: ${migration}`);
      continue;
    }

    await client.query("BEGIN");

    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration, sqlChecksum],
      );
      await client.query("COMMIT");
      console.log(`Database migration applied: ${migration}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

function checksum(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
