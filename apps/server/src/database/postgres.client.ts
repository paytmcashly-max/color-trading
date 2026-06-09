import pg from "pg";

import { env } from "../config/env.js";

let pool: pg.Pool | null = null;

export function getPostgresPool() {
  if (!env.DATABASE_URL) {
    return null;
  }

  pool ??= new pg.Pool({
    connectionString: env.DATABASE_URL,
  });

  return pool;
}

export async function getPostgresStatus() {
  const client = getPostgresPool();

  if (!client) {
    return "not_configured";
  }

  return "configured";
}
