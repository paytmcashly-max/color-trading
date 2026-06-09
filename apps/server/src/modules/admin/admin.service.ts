import {
  CoinLedgerDirection,
  RoundStatus,
  UserStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { HttpError } from "../../common/errors/http-error.js";
import { getPostgresStatus } from "../../database/postgres.client.js";
import { getRedisClient, getRedisStatus } from "../../database/redis.client.js";
import { getObservability } from "../observability/observability.module.js";
import { publishGameEvent } from "../game/game.events.js";
import { serializeRound } from "../game/game.serializer.js";
import { BET_LOCK_AFTER_MS, ROUND_DURATION_MS } from "../game/game.constants.js";
import { ResultService } from "../game/services/result.service.js";
import type { WalletService } from "../wallet/wallet.service.js";
import { serializeWallet } from "../wallet/wallet.serializer.js";
import {
  serializeAdminBet,
  serializeAdminLedger,
  serializeAdminRound,
  serializeAdminUser,
  serializeAuditLog,
  serializeFraudLog,
  serializeRiskProfile,
} from "./admin.serializer.js";
import type {
  AdminWalletAdjustmentDto,
  ForceStartRoundDto,
  ForceStopRoundDto,
} from "./dto/admin.validators.js";

const ACTIVE_ROUND_STATUSES = [
  RoundStatus.INIT,
  RoundStatus.OPEN,
  RoundStatus.LOCKED,
  RoundStatus.RESOLVING,
];

export class AdminService {
  private readonly resultService = new ResultService();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService,
  ) {}

  async listUsers(query?: string) {
    const where = this.buildUserSearchWhere(query);
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        wallet: {
          select: {
            balanceCoins: true,
            status: true,
            ledgerVersion: true,
          },
        },
        _count: {
          select: {
            bets: true,
            ledgerEntries: true,
          },
        },
      },
    });

    return { users: users.map(serializeAdminUser) };
  }

  async banUser(adminUserId: string, userId: string) {
    if (adminUserId === userId) {
      throw new HttpError(409, "CANNOT_BAN_SELF", "Admins cannot ban their own account.");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED },
      include: {
        wallet: {
          select: {
            balanceCoins: true,
            status: true,
            ledgerVersion: true,
          },
        },
        _count: {
          select: {
            bets: true,
            ledgerEntries: true,
          },
        },
      },
    });

    await this.writeAuditLog(adminUserId, "USER_BAN", "USER", userId, {
      email: user.email,
    });

    return { user: serializeAdminUser(user) };
  }

  async unbanUser(adminUserId: string, userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
      include: {
        wallet: {
          select: {
            balanceCoins: true,
            status: true,
            ledgerVersion: true,
          },
        },
        _count: {
          select: {
            bets: true,
            ledgerEntries: true,
          },
        },
      },
    });

    await this.writeAuditLog(adminUserId, "USER_UNBAN", "USER", userId, {
      email: user.email,
    });

    return { user: serializeAdminUser(user) };
  }

  async listRounds() {
    const rounds = await this.prisma.gameRound.findMany({
      orderBy: { startTime: "desc" },
      take: 100,
      include: {
        _count: {
          select: {
            bets: true,
          },
        },
      },
    });

    return { rounds: rounds.map(serializeAdminRound) };
  }

  async getActiveRound() {
    const round = await this.prisma.gameRound.findFirst({
      where: {
        status: {
          in: ACTIVE_ROUND_STATUSES,
        },
      },
      orderBy: { startTime: "desc" },
      include: {
        _count: {
          select: {
            bets: true,
          },
        },
      },
    });

    return { round: round ? serializeAdminRound(round) : null };
  }

  async forceStartRound(adminUserId: string, dto: ForceStartRoundDto) {
    const seed = this.resultService.createSeed();
    const startTime = new Date();
    const lockTime = new Date(startTime.getTime() + BET_LOCK_AFTER_MS);
    const endTime = new Date(startTime.getTime() + ROUND_DURATION_MS);

    const round = await this.prisma.$transaction(async (tx) => {
      await tx.gameRound.updateMany({
        where: {
          status: {
            in: ACTIVE_ROUND_STATUSES,
          },
        },
        data: {
          status: RoundStatus.CANCELLED,
        },
      });

      const latest = await tx.gameRound.findFirst({
        orderBy: { roundNumber: "desc" },
        select: { roundNumber: true },
      });

      return tx.gameRound.create({
        data: {
          roundNumber: (latest?.roundNumber ?? 0n) + 1n,
          startTime,
          lockTime,
          endTime,
          status: RoundStatus.OPEN,
          seedHash: seed.seedHash,
        },
      });
    });

    const redis = getRedisClient();
    if (redis) {
      await redis.set(`game:round:${round.id}:seed`, seed.seedReveal, "PX", ROUND_DURATION_MS * 2);
    }

    await this.writeAuditLog(adminUserId, "ROUND_FORCE_START", "ROUND", round.id, {
      reason: dto.reason ?? null,
      roundNumber: round.roundNumber.toString(),
    });

    publishGameEvent("round:created", { round: serializeRound(round) });

    return { round: serializeAdminRound({ ...round, _count: { bets: 0 } }) };
  }

  async forceStopRound(adminUserId: string, dto: ForceStopRoundDto) {
    const round = await this.prisma.$transaction(async (tx) => {
      const activeRound = await tx.gameRound.findFirst({
        where: {
          status: {
            in: ACTIVE_ROUND_STATUSES,
          },
        },
        orderBy: { startTime: "desc" },
      });

      if (!activeRound) {
        throw new HttpError(404, "ACTIVE_ROUND_NOT_FOUND", "There is no active round to stop.");
      }

      return tx.gameRound.update({
        where: { id: activeRound.id },
        data: { status: RoundStatus.CANCELLED },
      });
    });

    await this.writeAuditLog(adminUserId, "ROUND_FORCE_STOP", "ROUND", round.id, {
      reason: dto.reason,
      roundNumber: round.roundNumber.toString(),
    });

    publishGameEvent("round:completed", { round: serializeRound(round) });
    publishGameEvent("system:error", {
      code: "ADMIN_ROUND_FORCE_STOP",
      message: "Active round was stopped by an administrator.",
      roundId: round.id,
    });

    return { round: serializeAdminRound({ ...round, _count: { bets: 0 } }) };
  }

  async getWallet(userId: string) {
    const wallet =
      (await this.prisma.wallet.findUnique({
        where: { userId },
      })) ??
      (await this.prisma.$transaction((tx) =>
        tx.wallet.upsert({
          where: { userId },
          update: {},
          create: { userId },
        }),
      ));

    return { wallet: serializeWallet(wallet) };
  }

  async getLedger(userId: string) {
    const entries = await this.prisma.coinLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return { entries: entries.map(serializeAdminLedger) };
  }

  async adjustWallet(adminUserId: string, userId: string, dto: AdminWalletAdjustmentDto) {
    const auditLog = await this.writeAuditLog(adminUserId, "WALLET_ADMIN_ADJUSTMENT", "USER", userId, {
      amountCoins: dto.amountCoins,
      direction: dto.direction,
      reason: dto.reason,
    });

    const result = await this.walletService.adminAdjustCoins({
      userId,
      amountCoins: dto.amountCoins,
      referenceId: auditLog.id,
      idempotencyKey: dto.idempotencyKey ?? `admin:${auditLog.id}:wallet-adjustment`,
      direction: dto.direction as CoinLedgerDirection,
    });

    publishGameEvent("wallet:update", {
      userId,
      wallet: "wallet" in result ? result.wallet : undefined,
      ledgerEntry: result.ledgerEntry,
    });

    return result;
  }

  async listBets(filters: { roundId?: string; userId?: string }) {
    const where: Prisma.BetWhereInput = {
      ...(filters.roundId ? { roundId: filters.roundId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    };

    const [bets, suspiciousUsers] = await Promise.all([
      this.prisma.bet.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
          round: {
            select: {
              roundNumber: true,
              status: true,
            },
          },
        },
      }),
      this.findSuspiciousBettingPatterns(),
    ]);

    return {
      bets: bets.map(serializeAdminBet),
      suspiciousUsers,
    };
  }

  async getSystemHealth() {
    const [postgres, redis, activeRound, activeUsers, totals, highRiskUsers, recentHighSeverityFraud] = await Promise.all([
      getPostgresStatus(),
      getRedisStatus(),
      this.prisma.gameRound.findFirst({
        where: {
          status: {
            in: ACTIVE_ROUND_STATUSES,
          },
        },
        orderBy: { startTime: "desc" },
      }),
      this.prisma.authSession.count({
        where: {
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
      }),
      this.collectTotals(),
      this.prisma.userRiskProfile.count({
        where: {
          riskScore: {
            gte: 61,
          },
        },
      }),
      this.prisma.fraudLog.count({
        where: {
          severity: "HIGH",
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      status: postgres === "configured" && redis === "configured" ? "ok" : "degraded",
      activeUsers,
      dependencies: {
        postgres,
        redis,
      },
      currentRound: activeRound ? serializeAdminRound({ ...activeRound, _count: { bets: 0 } }) : null,
      totals,
      fraud: {
        highRiskUsers,
        recentHighSeverityFraud,
      },
      observability: getObservability().metrics.getSnapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  async listAuditLogs() {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return { auditLogs: logs.map(serializeAuditLog) };
  }

  async listFraudLogs() {
    const logs = await this.prisma.fraudLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return { fraudLogs: logs.map(serializeFraudLog) };
  }

  async listRiskProfiles() {
    const profiles = await this.prisma.userRiskProfile.findMany({
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

    return { riskProfiles: profiles.map(serializeRiskProfile) };
  }

  private writeAuditLog(
    adminUserId: string,
    actionType: string,
    targetType?: string,
    targetId?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        adminUserId,
        actionType,
        targetType,
        targetId,
        metadata,
      },
    });
  }

  private buildUserSearchWhere(query?: string): Prisma.UserWhereInput | undefined {
    const normalized = query?.trim();

    if (!normalized) {
      return undefined;
    }

    if (isUuid(normalized)) {
      return {
        OR: [
          { id: normalized },
          { email: { contains: normalized } },
        ],
      };
    }

    return {
      OR: [
        { email: { contains: normalized } },
        { displayName: { contains: normalized, mode: "insensitive" } },
      ],
    };
  }

  private async collectTotals() {
    const [users, rounds, bets, ledgerEntries] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.gameRound.count(),
      this.prisma.bet.count(),
      this.prisma.coinLedger.count(),
    ]);

    return { users, rounds, bets, ledgerEntries };
  }

  private async findSuspiciousBettingPatterns() {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const grouped = await this.prisma.bet.groupBy({
      by: ["userId"],
      where: {
        createdAt: {
          gte: since,
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        coinsStaked: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 10,
    });

    return grouped
      .filter((item) => item._count.id >= 5 || (item._sum.coinsStaked ?? 0n) >= 5000n)
      .map((item) => ({
        userId: item.userId,
        betCountLastHour: item._count.id,
        coinsStakedLastHour: (item._sum.coinsStaked ?? 0n).toString(),
      }));
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
