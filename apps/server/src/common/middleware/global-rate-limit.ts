import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisReply } from "rate-limit-redis";
import type { Request } from "express";

import { env } from "../../config/env.js";
import { getRedisClient } from "../../database/redis.client.js";
import { verifyAccessToken } from "../utils/jwt.js";

function rateLimitKey(req: Request) {
  const userId = req.auth?.userId ?? readUserIdFromAuthorization(req);

  return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

function readUserIdFromAuthorization(req: Request) {
  const [scheme, token] = req.headers.authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  try {
    return verifyAccessToken(token).sub;
  } catch {
    return null;
  }
}

export const globalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  store: createRateLimitStore("global"),
  skip: (req) => req.path.startsWith("/health"),
  message: {
    success: false,
    message: "Too many requests. Please retry shortly.",
    data: {
      code: "GLOBAL_RATE_LIMITED",
    },
  },
});

export const mutationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  store: createRateLimitStore("mutation"),
  skip: (req) => !["POST", "PUT", "PATCH", "DELETE"].includes(req.method),
  message: {
    success: false,
    message: "Too many write requests. Please retry shortly.",
    data: {
      code: "MUTATION_RATE_LIMITED",
    },
  },
});

export function createRateLimitStore(name: string) {
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    return undefined;
  }

  const redis = getRedisClient();

  if (!redis) {
    return undefined;
  }

  return new RedisStore({
    prefix: `rate-limit:${env.NODE_ENV}:${name}:`,
    sendCommand: (...args: string[]) => redis.call(args[0]!, ...args.slice(1)) as Promise<RedisReply>,
  });
}
