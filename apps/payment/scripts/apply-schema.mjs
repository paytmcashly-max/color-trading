import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const databaseUrl = process.env.PAYMENT_DATABASE_URL;
if (!databaseUrl) throw new Error("PAYMENT_DATABASE_URL is required.");

const client = new pg.Client({ connectionString: databaseUrl });
const scriptDir = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(resolve(scriptDir, "../prisma/migrations/20260614_init.sql"), "utf8");
const migrationLockId = 4_268_202_611;

await client.connect();
try {
  await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Payment service schema applied.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]).catch(() => undefined);
  await client.end();
}
