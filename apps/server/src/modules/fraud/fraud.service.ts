import { FraudSeverity, type Prisma, type PrismaClient } from "@prisma/client";
import type { Request } from "express";
import type { Redis } from "ioredis";

import { HttpError } from "../../common/errors/http-error.js";
import { logger } from "../../common/utils/logger.js";
import { publishRealtimeEvent } from "../../sockets/socket.events.js";
import { BotDetector } from "./botDetector.js";
import { FraudRateLimiter, type RateLimitDecision } from "./rateLimiter.js";
import { RiskEngine } from "./risk.engine.js";
import { getIpAddress, SessionTracker } from "./sessionTracker.js";

const BET_USER_LIMIT = { limit: 6, windowMs: 10_000 };
const BET_IP_LIMIT = { limit: 80, windowMs: 60_000 };
const BET_SOFT_LIMIT = { limit: 2, windowMs: 10_000 };
const AUTH_IP_LIMIT = { limit: 20, windowMs: 15 * 60_000 };
const SOCKET_USER_LIMIT = { limit: 40, windowMs: 10_000 };

export class FraudService {
  private readonly riskEngine: RiskEngine;
  private readonly rateLimiter: FraudRateLimiter;
  private readonly botDetector: BotDetector;
  private readonly sessionTracker: SessionTracker;

  constructor(
    private readonly prisma: PrismaClient,
    redis: Redis | null,
  ) {
    this.riskEngine = new RiskEngine(prisma);
    this.rateLimiter = new FraudRateLimiter(redis);
    this.botDetector = new BotDetector(redis);
    this.sessionTracker = new SessionTracker(redis);
  }

  async enforceAuthRateLimit(req: Request) {
    const ipAddress = getIpAddress(req) ?? "unknown";
    const decision = await this.rateLimiter.consume(
      `auth:ip:${ipAddress}`,
      AUTH_IP_LIMIT.limit,
      AUTH_IP_LIMIT.windowMs,
    );

    if (!decision.allowed) {
      await this.recordFraudEvent({
        eventType: "LOGIN_RATE_LIMIT",
        severity: FraudSeverity.MEDIUM,
        metadata: {
          ipAddress,
          limit: decision.limit,
          resetAt: decision.resetAt.toISOString(),
        },
      });
      throw new HttpError(429, "AUTH_RATE_LIMITED", "Too many authentication attempts.");
    }
  }

  async observeAuthenticatedSession(userId: string, req: Request) {
    const observation = await this.sessionTracker.observeUserSession(userId, req);

    for (const signal of observation.signals) {
      await this.applyRiskSignal({
        userId,
        eventType: signal.eventType,
        severity: FraudSeverity.MEDIUM,
        points: signal.riskPoints,
        metadata: toJsonObject(signal.metadata),
      });
    }

    return observation;
  }

  async enforceBettingPolicy(
    userId: string,
    req: Request,
    bet: {
      roundId: string;
      choice: string;
      coinsStaked: number;
    },
  ) {
    const ipAddress = getIpAddress(req) ?? "unknown";
    const riskProfile = await this.riskEngine.decayRisk(userId);

    if (riskProfile.isBlocked || riskProfile.riskScore >= 81) {
      await this.recordFraudEvent({
        userId,
        eventType: "BET_BLOCKED_HIGH_RISK",
        severity: FraudSeverity.HIGH,
        metadata: {
          riskScore: riskProfile.riskScore,
          roundId: bet.roundId,
          ipAddress,
        },
      });
      throw new HttpError(423, "BETTING_BLOCKED_RISK", "Betting is temporarily restricted for this user.");
    }

    const [userLimit, ipLimit] = await Promise.all([
      this.rateLimiter.consume(`bet:user:${userId}`, BET_USER_LIMIT.limit, BET_USER_LIMIT.windowMs),
      this.rateLimiter.consume(`bet:ip:${ipAddress}`, BET_IP_LIMIT.limit, BET_IP_LIMIT.windowMs),
    ]);

    if (!userLimit.allowed) {
      await this.handleRateLimit(userId, "BET_USER_RATE_LIMIT", userLimit, { ipAddress, ...bet });
      throw new HttpError(429, "BET_RATE_LIMITED", "Too many betting attempts.");
    }

    if (!ipLimit.allowed) {
      await this.handleRateLimit(userId, "BET_IP_RATE_LIMIT", ipLimit, { ipAddress, ...bet });
      throw new HttpError(429, "BET_RATE_LIMITED", "Too many betting attempts from this network.");
    }

    if (riskProfile.riskScore >= 61) {
      const softLimit = await this.rateLimiter.consume(
        `bet:soft:user:${userId}`,
        BET_SOFT_LIMIT.limit,
        BET_SOFT_LIMIT.windowMs,
      );

      if (!softLimit.allowed) {
        await this.handleRateLimit(userId, "BET_SOFT_LIMIT", softLimit, {
          ipAddress,
          riskScore: riskProfile.riskScore,
          ...bet,
        });
        throw new HttpError(429, "BET_SOFT_LIMITED", "Betting frequency is restricted for this user.");
      }
    }

    void this.observeBetActivity(userId, req, bet);
  }

  async recordSocketRateLimit(userId: string, metadata: Record<string, unknown>) {
    await this.applyRiskSignal({
      userId,
      eventType: "SOCKET_RATE_LIMIT",
      severity: FraudSeverity.MEDIUM,
      points: 8,
      metadata: toJsonObject(metadata),
    });
    publishRealtimeEvent("fraud:rate_limit_triggered", {
      userId,
      eventType: "SOCKET_RATE_LIMIT",
      metadata: toJsonObject(metadata),
      createdAt: new Date().toISOString(),
    });
  }

  async enforceSocketEventLimit(userId: string, metadata: Record<string, unknown>) {
    const decision = await this.rateLimiter.consume(
      `socket:user:${userId}`,
      SOCKET_USER_LIMIT.limit,
      SOCKET_USER_LIMIT.windowMs,
    );

    if (decision.allowed) {
      return true;
    }

    await this.recordSocketRateLimit(userId, {
      ...metadata,
      limit: decision.limit,
      resetAt: decision.resetAt.toISOString(),
      limiter: "redis_socket_guard",
    });

    return false;
  }

  async recordWalletFailure(userId: string, metadata: Record<string, unknown>) {
    await this.applyRiskSignal({
      userId,
      eventType: "WALLET_FAILED_TRANSACTION",
      severity: FraudSeverity.MEDIUM,
      points: 8,
      metadata: toJsonObject(metadata),
    });
  }

  async getRecentFraudLogs() {
    return this.prisma.fraudLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getHighRiskProfiles() {
    return this.prisma.userRiskProfile.findMany({
      where: {
        riskScore: {
          gte: 31,
        },
      },
      orderBy: { riskScore: "desc" },
      take: 100,
      include: {
        user: {
          select: {
            email: true,
            displayName: true,
            status: true,
          },
        },
      },
    });
  }

  private async observeBetActivity(
    userId: string,
    req: Request,
    bet: {
      roundId: string;
      choice: string;
      coinsStaked: number;
    },
  ) {
    try {
      const sessionObservation = await this.sessionTracker.observeUserSession(userId, req);

      for (const signal of sessionObservation.signals) {
        await this.applyRiskSignal({
          userId,
          eventType: signal.eventType,
          severity: FraudSeverity.MEDIUM,
          points: signal.riskPoints,
          metadata: toJsonObject(signal.metadata),
        });
      }

      const botSignals = await this.botDetector.inspectBet({
        userId,
        choice: bet.choice,
        amountCoins: bet.coinsStaked,
        occurredAt: new Date(),
      });

      for (const signal of botSignals) {
        await this.applyRiskSignal({
          userId,
          eventType: signal.eventType,
          severity: FraudSeverity.HIGH,
          points: signal.riskPoints,
          botSuspected: true,
          metadata: toJsonObject({
            ...signal.metadata,
            roundId: bet.roundId,
          }),
        });
      }
    } catch (error) {
      logger.warn("fraud_bet_observation_failed", { error, userId });
    }
  }

  private async handleRateLimit(
    userId: string,
    eventType: string,
    decision: RateLimitDecision,
    metadata: Record<string, unknown>,
  ) {
    await this.applyRiskSignal({
      userId,
      eventType,
      severity: FraudSeverity.MEDIUM,
      points: 10,
      metadata: toJsonObject({
        ...metadata,
        limit: decision.limit,
        resetAt: decision.resetAt.toISOString(),
      }),
    });

    publishRealtimeEvent("fraud:rate_limit_triggered", {
      userId,
      eventType,
      metadata,
      createdAt: new Date().toISOString(),
    });
  }

  private async applyRiskSignal(input: {
    userId: string;
    eventType: string;
    severity: FraudSeverity;
    points: number;
    metadata?: Prisma.InputJsonValue;
    botSuspected?: boolean;
  }) {
    const [log, profile] = await Promise.all([
      this.recordFraudEvent({
        userId: input.userId,
        eventType: input.eventType,
        severity: input.severity,
        metadata: input.metadata,
      }),
      this.riskEngine.adjustRisk({
        userId: input.userId,
        points: input.points,
        reason: input.eventType,
        severity: input.severity,
        botSuspected: input.botSuspected,
      }),
    ]);

    publishRealtimeEvent("fraud:alert", {
      log,
      riskProfile: profile,
    });

    if (profile.riskScore >= 61 || input.severity === FraudSeverity.HIGH) {
      publishRealtimeEvent("fraud:high_risk_user", {
        userId: input.userId,
        riskScore: profile.riskScore,
        isBlocked: profile.isBlocked,
        botSuspected: profile.botSuspected,
        eventType: input.eventType,
        createdAt: new Date().toISOString(),
      });
    }

    return { log, profile };
  }

  private async recordFraudEvent(input: {
    userId?: string;
    eventType: string;
    severity: FraudSeverity;
    metadata?: Prisma.InputJsonValue;
  }) {
    const log = await this.prisma.fraudLog.create({
      data: {
        userId: input.userId,
        eventType: input.eventType,
        severity: input.severity,
        metadata: input.metadata,
      },
    });

    logger.info("fraud_event_logged", {
      fraudLogId: log.id,
      userId: input.userId,
      eventType: input.eventType,
      severity: input.severity,
    });

    return {
      id: log.id,
      userId: log.userId,
      eventType: log.eventType,
      severity: log.severity,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    };
  }
}

function toJsonObject(metadata: Record<string, unknown>): Prisma.InputJsonObject {
  return metadata as Prisma.InputJsonObject;
}
