import crypto from "node:crypto";
import type { Redis } from "ioredis";

export class RedisLockService {
  constructor(private readonly redis: Redis | null) {}

  async withLock<TResult>(
    key: string,
    ttlMs: number,
    handler: () => Promise<TResult>,
  ) {
    if (!this.redis) {
      return handler();
    }

    const token = crypto.randomUUID();
    await this.ensureConnected();
    const acquired = await this.redis.set(key, token, "PX", ttlMs, "NX");

    if (acquired !== "OK") {
      return null;
    }

    try {
      return await handler();
    } finally {
      await this.release(key, token);
    }
  }

  private async ensureConnected() {
    if (!this.redis || this.redis.status === "ready") {
      return;
    }

    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }

  private async release(key: string, token: string) {
    if (!this.redis) {
      return;
    }

    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    );
  }
}
