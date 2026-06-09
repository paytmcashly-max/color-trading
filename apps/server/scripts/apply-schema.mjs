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

const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  const existing = await client.query(
    "select to_regclass('public.users') as users_table",
  );

  if (existing.rows[0]?.users_table) {
    console.log("Database schema already exists; skipping init.sql.");
  } else {
    const sql = await readFile(schemaPath, "utf8");
    await client.query(sql);
    console.log("Database schema applied from init.sql.");
  }

  const migrations = (await readdir(migrationsPath))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const sql = await readFile(resolve(migrationsPath, migration), "utf8");
    await client.query(sql);
    console.log(`Database migration applied: ${migration}`);
  }
} finally {
  await client.end();
}
