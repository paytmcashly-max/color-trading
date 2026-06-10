import pg from "pg";

import { env } from "../config/env.js";

let pool: pg.Pool | null = null;

export function getPostgresPool() {
  if (!env.DATABASE_URL) {
    return null;
  }

  pool ??= new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === "production" ? 20 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "color-trading-server",
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
