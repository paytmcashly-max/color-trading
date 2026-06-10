import { Redis } from "ioredis";

import { env } from "../config/env.js";

let redis: Redis | null = null;

export function getRedisClient() {
  if (!env.REDIS_URL) {
    return null;
  }

  redis ??= new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectionName: "color-trading-server",
    retryStrategy(times) {
      return Math.min(times * 100, 2_000);
    },
  });

  return redis;
}

export async function getRedisStatus() {
  const client = getRedisClient();

  if (!client) {
    return "not_configured";
  }

  return "configured";
}
