import { createAdapter } from "@socket.io/redis-adapter";
import type { Server } from "socket.io";

import { logger } from "../common/utils/logger.js";
import { getRedisClient } from "../database/redis.client.js";

export async function configureRedisAdapter(io: Server) {
  const redis = getRedisClient();

  if (!redis) {
    logger.warn("socket_redis_adapter_not_configured");
    return;
  }

  const pubClient = redis;
  const subClient = pubClient.duplicate();

  if (pubClient.status === "wait") {
    await pubClient.connect();
  }

  if (subClient.status === "wait") {
    await subClient.connect();
  }

  io.adapter(createAdapter(pubClient, subClient));
  logger.info("socket_redis_adapter_configured");
}
