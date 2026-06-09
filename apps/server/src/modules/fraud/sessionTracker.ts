import crypto from "node:crypto";
import type { Request } from "express";
import type { Redis } from "ioredis";

export interface SessionSignal {
  eventType: "MULTI_ACCOUNT_IP" | "MULTI_ACCOUNT_DEVICE";
  riskPoints: number;
  metadata: Record<string, unknown>;
}

export class SessionTracker {
  constructor(private readonly redis: Redis | null) {}

  async observeUserSession(userId: string, req: Request) {
    const ipAddress = getIpAddress(req);
    const fingerprint = createDeviceFingerprint(req);
    const signals: SessionSignal[] = [];

    if (!this.redis) {
      return { ipAddress, fingerprint, signals };
    }

    await this.connectIfNeeded();

    if (ipAddress) {
      const ipKey = `fraud:session:ip:${ipAddress}`;
      await this.redis.sadd(ipKey, userId);
      await this.redis.expire(ipKey, 7 * 24 * 60 * 60);
      const ipUsers = await this.redis.scard(ipKey);

      if (ipUsers >= 4) {
        signals.push({
          eventType: "MULTI_ACCOUNT_IP",
          riskPoints: 10,
          metadata: { ipAddress, accountCount: ipUsers },
        });
      }
    }

    const deviceKey = `fraud:session:device:${fingerprint}`;
    await this.redis.sadd(deviceKey, userId);
    await this.redis.expire(deviceKey, 7 * 24 * 60 * 60);
    const deviceUsers = await this.redis.scard(deviceKey);

    if (deviceUsers >= 3) {
      signals.push({
        eventType: "MULTI_ACCOUNT_DEVICE",
        riskPoints: 15,
        metadata: { fingerprint, accountCount: deviceUsers },
      });
    }

    return { ipAddress, fingerprint, signals };
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

export function createDeviceFingerprint(req: Request) {
  const userAgent = req.get("user-agent") ?? "unknown";
  const language = req.get("accept-language") ?? "unknown";
  const platformHint = req.get("sec-ch-ua-platform") ?? "unknown";

  return crypto
    .createHash("sha256")
    .update(`${userAgent}|${language}|${platformHint}`)
    .digest("hex")
    .slice(0, 32);
}

export function getIpAddress(req: Request) {
  const forwarded = req.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || req.socket.remoteAddress || null;
}
