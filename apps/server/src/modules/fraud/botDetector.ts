import type { Redis } from "ioredis";

export interface BotSignal {
  eventType: "BOT_TIMING_PATTERN" | "BOT_SHARED_BEHAVIOR_PATTERN";
  riskPoints: number;
  metadata: Record<string, unknown>;
}

export class BotDetector {
  constructor(private readonly redis: Redis | null) {}

  async inspectBet(input: {
    userId: string;
    choice: string;
    amountCoins: number;
    occurredAt: Date;
  }) {
    if (!this.redis) {
      return [];
    }

    await this.connectIfNeeded();
    const signals: BotSignal[] = [];
    const timings = await this.recordTiming(input.userId, input.occurredAt.getTime());

    if (timings.length >= 5 && hasConsistentIntervals(timings)) {
      signals.push({
        eventType: "BOT_TIMING_PATTERN",
        riskPoints: 18,
        metadata: {
          sampleSize: timings.length,
          intervalsMs: buildIntervals(timings).slice(0, 8),
        },
      });
    }

    const sharedUsers = await this.recordBehaviorSignature(input);

    if (sharedUsers >= 6) {
      signals.push({
        eventType: "BOT_SHARED_BEHAVIOR_PATTERN",
        riskPoints: 12,
        metadata: {
          signatureUserCount: sharedUsers,
          choice: input.choice,
          amountCoins: input.amountCoins,
        },
      });
    }

    return signals;
  }

  private async recordTiming(userId: string, timestampMs: number) {
    const key = `fraud:bot:bet-times:${userId}`;
    await this.redis!.lpush(key, String(timestampMs));
    await this.redis!.ltrim(key, 0, 9);
    await this.redis!.expire(key, 3600);

    const values = await this.redis!.lrange(key, 0, 9);
    return values
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
  }

  private async recordBehaviorSignature(input: {
    userId: string;
    choice: string;
    amountCoins: number;
  }) {
    const bucket = Math.floor(Date.now() / 60_000);
    const key = `fraud:bot:signature:${bucket}:${input.choice}:${input.amountCoins}`;
    await this.redis!.sadd(key, input.userId);
    await this.redis!.expire(key, 900);
    return this.redis!.scard(key);
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

function hasConsistentIntervals(timestamps: number[]) {
  const intervals = buildIntervals(timestamps);

  if (intervals.length < 4) {
    return false;
  }

  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance = intervals.reduce((sum, value) => sum + Math.abs(value - average), 0) / intervals.length;

  return average > 0 && variance <= Math.max(150, average * 0.08);
}

function buildIntervals(timestamps: number[]) {
  const intervals: number[] = [];

  for (let index = 1; index < timestamps.length; index += 1) {
    intervals.push(timestamps[index]! - timestamps[index - 1]!);
  }

  return intervals;
}
