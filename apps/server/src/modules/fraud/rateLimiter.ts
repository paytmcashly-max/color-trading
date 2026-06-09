import type { Redis } from "ioredis";

export interface RateLimitDecision {
  allowed: boolean;
  key: string;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export class FraudRateLimiter {
  constructor(private readonly redis: Redis | null) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    if (!this.redis) {
      return {
        allowed: true,
        key,
        limit,
        remaining: limit - 1,
        resetAt: new Date(Date.now() + windowMs),
      };
    }

    await this.connectIfNeeded();
    const redisKey = `fraud:rl:${key}`;
    const count = await this.redis.incr(redisKey);

    if (count === 1) {
      await this.redis.pexpire(redisKey, windowMs);
    }

    const ttl = await this.redis.pttl(redisKey);
    const resetAt = new Date(Date.now() + Math.max(ttl, 0));

    return {
      allowed: count <= limit,
      key,
      limit,
      remaining: Math.max(limit - count, 0),
      resetAt,
    };
  }

  private async connectIfNeeded() {
    if (!this.redis || this.redis.status === "ready") {
      return;
    }

    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }
}
