import {
  BetStatus,
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

type RefundWalletUpdate = {
  userId: string;
  amountCoins: number;
  wallet: Parameters<WalletService["publishWalletUpdate"]>[1];
  ledgerEntry: Parameters<WalletService["publishWalletUpdate"]>[2];
};

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
            depositBalance: true,
            winningBalance: true,
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
            depositBalance: true,
            winningBalance: true,
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
            depositBalance: true,
            winningBalance: true,
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

    const { round, refunds, cancelledBetCount, refundedCoins } = await this.prisma.$transaction(async (tx) => {
      const activeRounds = await tx.gameRound.findMany({
        where: {
          status: {
            in: ACTIVE_ROUND_STATUSES,
          },
        },
        include: {
          bets: {
            where: {
              status: BetStatus.PENDING,
            },
            select: {
              id: true,
              userId: true,
              coinsStaked: true,
            },
          },
        },
      });
      const refunds = await this.refundPendingBetsForCancelledRounds(tx, activeRounds);

      await tx.gameRound.updateMany({
        where: {
          id: {
            in: activeRounds.map((activeRound) => activeRound.id),
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

      const round = await tx.gameRound.create({
        data: {
          roundNumber: (latest?.roundNumber ?? 0n) + 1n,
          startTime,
          lockTime,
          endTime,
          status: RoundStatus.OPEN,
          seedHash: seed.seedHash,
        },
      });

      return {
        round,
        refunds,
        cancelledBetCount: refunds.length,
        refundedCoins: refunds.reduce((total, refund) => total + refund.amountCoins, 0),
      };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });

    const redis = getRedisClient();
    if (redis) {
      await redis.set(`game:round:${round.id}:seed`, seed.seedReveal, "PX", ROUND_DURATION_MS * 2);
    }

    await this.writeAuditLog(adminUserId, "ROUND_FORCE_START", "ROUND", round.id, {
      reason: dto.reason ?? null,
      roundNumber: round.roundNumber.toString(),
      cancelledBetCount,
      refundedCoins,
    });

    this.publishRefundWalletUpdates(refunds);
    publishGameEvent("round:created", { round: serializeRound(round) });

    return { round: serializeAdminRound({ ...round, _count: { bets: 0 } }) };
  }

  async forceStopRound(adminUserId: string, dto: ForceStopRoundDto) {
    const { round, refunds, cancelledBetCount, refundedCoins } = await this.prisma.$transaction(async (tx) => {
      const activeRound = await tx.gameRound.findFirst({
        where: {
          status: {
            in: ACTIVE_ROUND_STATUSES,
          },
        },
        orderBy: { startTime: "desc" },
        include: {
          bets: {
            where: {
              status: BetStatus.PENDING,
            },
            select: {
              id: true,
              userId: true,
              coinsStaked: true,
            },
          },
        },
      });

      if (!activeRound) {
        throw new HttpError(404, "ACTIVE_ROUND_NOT_FOUND", "There is no active round to stop.");
      }

      const refunds = await this.refundPendingBetsForCancelledRounds(tx, [activeRound]);
      const round = await tx.gameRound.update({
        where: { id: activeRound.id },
        data: { status: RoundStatus.CANCELLED },
      });

      return {
        round,
        refunds,
        cancelledBetCount: refunds.length,
        refundedCoins: refunds.reduce((total, refund) => total + refund.amountCoins, 0),
      };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });

    await this.writeAuditLog(adminUserId, "ROUND_FORCE_STOP", "ROUND", round.id, {
      reason: dto.reason,
      roundNumber: round.roundNumber.toString(),
      cancelledBetCount,
      refundedCoins,
    });

    this.publishRefundWalletUpdates(refunds);
    publishGameEvent("round:completed", { round: serializeRound(round) });
    publishGameEvent("system:error", {
      code: "ADMIN_ROUND_FORCE_STOP",
      message: "Active round was stopped by an administrator.",
      roundId: round.id,
    });

    return { round: serializeAdminRound({ ...round, _count: { bets: 0 } }) };
  }

  async getWallet(userId: string) {
    return this.walletService.getWalletBalance(userId);
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

  private async refundPendingBetsForCancelledRounds(
    tx: Prisma.TransactionClient,
    rounds: Array<{
      id: string;
      bets: Array<{
        id: string;
        userId: string;
        coinsStaked: bigint;
      }>;
    }>,
  ) {
    const refunds: RefundWalletUpdate[] = [];

    for (const round of rounds) {
      for (const bet of round.bets) {
        if (bet.coinsStaked > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new HttpError(500, "REFUND_TOO_LARGE", "Bet refund exceeds safe service limits.");
        }

        const amountCoins = Number(bet.coinsStaked);
        const refund = await this.walletService.refundCancelledBetInTransaction(tx, {
          userId: bet.userId,
          amountCoins,
          referenceId: bet.id,
          idempotencyKey: `round:${round.id}:bet:${bet.id}:cancel-refund`,
        });

        await tx.bet.updateMany({
          where: {
            id: bet.id,
            status: BetStatus.PENDING,
          },
          data: {
            status: BetStatus.CANCELLED,
            payoutAmount: 0n,
          },
        });

        if ("wallet" in refund && refund.wallet) {
          const { wallet, ledgerEntry } = refund;
          refunds.push({
            userId: bet.userId,
            amountCoins,
            wallet,
            ledgerEntry,
          });
        }
      }
    }

    return refunds;
  }

  private publishRefundWalletUpdates(
    refunds: RefundWalletUpdate[],
  ) {
    for (const refund of refunds) {
      this.walletService.publishWalletUpdate(refund.userId, refund.wallet, refund.ledgerEntry);
    }
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
