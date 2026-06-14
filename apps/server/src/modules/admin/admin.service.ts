import {
  BetStatus,
  CoinLedgerDirection,
  Prisma,
  RoundStatus,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import crypto from "node:crypto";

import { HttpError } from "../../common/errors/http-error.js";
import { redactSensitiveData } from "../../common/security/redact.js";
import {
  createdAtIdDescWhere,
  encodeCreatedAtIdCursor,
  pageInfo,
  type PaginationInput,
} from "../../common/utils/pagination.js";
import { getPostgresStatus } from "../../database/postgres.client.js";
import { getRedisStatus } from "../../database/redis.client.js";
import { getObservability } from "../observability/observability.module.js";
import { publishGameEvent } from "../game/game.events.js";
import { serializeRound } from "../game/game.serializer.js";
import {
  BET_LOCK_AFTER_MS,
  ROUND_DURATION_MS,
} from "../game/game.constants.js";
import { ResultService } from "../game/services/result.service.js";
import { clearRoundSeedReveal, readRoundSeedReveal, storeRoundSeedReveal } from "../game/services/round-seed.service.js";
import { encryptRoundSeedReveal } from "../game/services/round-secret.crypto.js";
import { GameRepository } from "../game/repositories/game.repository.js";
import { SettlementService } from "../game/services/settlement.service.js";
import { publishRealtimeEvent } from "../../sockets/socket.events.js";
import type { WalletService } from "../wallet/wallet.service.js";
import { RealMoneySettlementService } from "../real-money/real-money-settlement.service.js";
import { hashToken } from "../../common/utils/token-hash.js";
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
  ForceResultDto,
  ForceStartRoundDto,
  ForceStopRoundDto,
  GamePauseDto,
  GameResumeDto,
} from "./dto/admin.validators.js";

const ACTIVE_ROUND_STATUSES = [
  RoundStatus.INIT,
  RoundStatus.OPEN,
  RoundStatus.LOCKED,
  RoundStatus.RESOLVING,
];

type RefundWalletUpdate = {
  betId: string;
  roundId: string;
  choice: "RED" | "GREEN" | "VIOLET";
  userId: string;
  amountCoins: number;
  wallet: Parameters<WalletService["publishWalletUpdate"]>[1];
  ledgerEntry: Parameters<WalletService["publishWalletUpdate"]>[2];
};

type GameControlRecord = {
  id: string;
  paused: boolean;
  reason: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class AdminService {
  private readonly resultService = new ResultService();
  private readonly settlementService: SettlementService;
  private readonly gameRepository: GameRepository;
  private readonly realMoneySettlementService: RealMoneySettlementService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService,
  ) {
    this.gameRepository = new GameRepository(prisma);
    this.settlementService = new SettlementService(this.gameRepository, walletService);
    this.realMoneySettlementService = new RealMoneySettlementService(prisma);
  }

  async getDashboardStats() {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [health, gameControl, recentBets, recentUsers, recentAuditActions] = await Promise.all([
      this.getSystemHealth(),
      this.getGameControl(),
      this.prisma.bet.count({
        where: {
          createdAt: { gte: since },
        },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { gte: since },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          createdAt: { gte: since },
        },
      }),
    ]);

    return {
      ...health,
      gameControl: gameControl.gameControl,
      activityLastHour: {
        bets: recentBets,
        newUsers: recentUsers,
        adminActions: recentAuditActions,
      },
    };
  }

  async listUsers(query?: string, pagination: PaginationInput = { limit: 50 }) {
    const searchWhere = this.buildUserSearchWhere(query);
    const cursorWhere = createdAtIdDescWhere(pagination.cursor);
    const where: Prisma.UserWhereInput = searchWhere
      ? { AND: [searchWhere, cursorWhere] }
      : cursorWhere;
    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
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

    const page = pageInfo(users, pagination.limit, (user) =>
      encodeCreatedAtIdCursor(user.createdAt, user.id),
    );

    return { users: page.items.map(serializeAdminUser), pageInfo: page.pageInfo };
  }

  async banUser(adminUserId: string, userId: string) {
    if (adminUserId === userId) {
      throw new HttpError(409, "CANNOT_BAN_SELF", "Admins cannot ban their own account.");
    }

    const { user, revokedSessionCount } = await this.prisma.$transaction(async (tx) => {
      const suspendedUser = await tx.user.update({
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

      const revokedSessions = await tx.authSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          adminUserId,
          actionType: "USER_BAN",
          targetType: "USER",
          targetId: userId,
          metadata: auditMetadata({
            email: suspendedUser.email,
            revokedSessionCount: revokedSessions.count,
          }),
        },
      });

      return {
        user: suspendedUser,
        revokedSessionCount: revokedSessions.count,
      };
    });

    publishRealtimeEvent("user:suspended", {
      userId,
      reason: "ADMIN_BAN",
      revokedSessionCount,
      suspendedAt: new Date().toISOString(),
    });

    return { user: serializeAdminUser(user) };
  }

  async unbanUser(adminUserId: string, userId: string) {
    const user = await this.prisma.$transaction(async (tx) => {
      const activeUser = await tx.user.update({
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

      await tx.auditLog.create({
        data: {
          adminUserId,
          actionType: "USER_UNBAN",
          targetType: "USER",
          targetId: userId,
          metadata: auditMetadata({
            email: activeUser.email,
          }),
        },
      });

      return activeUser;
    });

    return { user: serializeAdminUser(user) };
  }

  async listRounds(pagination: PaginationInput = { limit: 50 }) {
    const rounds = await this.prisma.gameRound.findMany({
      where: createdAtIdDescWhere(pagination.cursor),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
      include: {
        _count: {
          select: {
            bets: true,
          },
        },
      },
    });

    const page = pageInfo(rounds, pagination.limit, (round) =>
      encodeCreatedAtIdCursor(round.createdAt, round.id),
    );
    const cancelledRoundIds = page.items
      .filter((round) => round.status === RoundStatus.CANCELLED)
      .map((round) => round.id);
    const cancellationLogs = cancelledRoundIds.length > 0
      ? await this.prisma.auditLog.findMany({
          where: {
            actionType: "ROUND_FORCE_STOP",
            targetType: "ROUND",
            targetId: { in: cancelledRoundIds },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const exposureRows = page.items.length > 0
      ? await this.prisma.bet.groupBy({
          by: ["roundId", "choice"],
          where: { roundId: { in: page.items.map((round) => round.id) } },
          _count: { id: true },
          _sum: { coinsStaked: true },
        })
      : [];
    const cancellationsByRoundId = new Map<string, { reason: string | null; actorId: string | null }>();
    for (const log of cancellationLogs) {
      if (log.targetId && !cancellationsByRoundId.has(log.targetId)) {
        cancellationsByRoundId.set(log.targetId, {
          reason: readAuditReason(log.metadata),
          actorId: log.adminUserId,
        });
      }
    }

    return {
      rounds: page.items.map((round) =>
        serializeAdminRound(
          round,
          cancellationsByRoundId.get(round.id),
          exposureRows
            .filter((item) => item.roundId === round.id)
            .map((item) => ({
              choice: item.choice,
              betCount: item._count.id,
              coinsStaked: item._sum.coinsStaked ?? 0n,
            })),
        ),
      ),
      pageInfo: page.pageInfo,
    };
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

    if (!round) {
      return { round: null };
    }

    const exposureRows = await this.prisma.bet.groupBy({
      by: ["choice"],
      where: { roundId: round.id },
      _count: { id: true },
      _sum: { coinsStaked: true },
    });

    return {
      round: serializeAdminRound(
        round,
        undefined,
        exposureRows.map((item) => ({
          choice: item.choice,
          betCount: item._count.id,
          coinsStaked: item._sum.coinsStaked ?? 0n,
        })),
      ),
    };
  }

  async forceStartRound(adminUserId: string, dto: ForceStartRoundDto) {
    const seed = this.resultService.createSeed();
    const startTime = new Date();
    const lockTime = new Date(startTime.getTime() + BET_LOCK_AFTER_MS);
    const endTime = new Date(startTime.getTime() + ROUND_DURATION_MS);

    const { round, refunds, cancelledRoundIds } = await this.prisma.$transaction(async (tx) => {
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
              choice: true,
            },
          },
        },
      });
      const refunds = await this.refundPendingBetsForCancelledRounds(tx, activeRounds, adminUserId);

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
      await tx.gameRoundSecret.create({
        data: {
          roundId: round.id,
          seedRevealEncrypted: encryptRoundSeedReveal(seed.seedReveal),
        },
      });

      await tx.auditLog.create({
        data: {
          adminUserId,
          actionType: "ROUND_FORCE_START",
          targetType: "ROUND",
          targetId: round.id,
          metadata: auditMetadata({
            reason: dto.reason ?? null,
            roundNumber: round.roundNumber.toString(),
            cancelledBetCount: refunds.length,
            refundedCoins: refunds.reduce((total, refund) => total + refund.amountCoins, 0),
          }),
        },
      });

      return {
        round,
        refunds,
        cancelledRoundIds: activeRounds.map((activeRound) => activeRound.id),
      };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });

    await storeRoundSeedReveal(round.id, seed.seedReveal);

    this.publishRefundWalletUpdates(refunds);
    for (const cancelledRoundId of cancelledRoundIds) {
      await this.realMoneySettlementService.refundRound(cancelledRoundId);
    }
    publishGameEvent("round:created", { round: serializeRound(round) });

    return { round: serializeAdminRound({ ...round, _count: { bets: 0 } }) };
  }

  async forceStopRound(adminUserId: string, dto: ForceStopRoundDto) {
    const { round, refunds } = await this.prisma.$transaction(async (tx) => {
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
              choice: true,
            },
          },
        },
      });

      if (!activeRound) {
        throw new HttpError(404, "ACTIVE_ROUND_NOT_FOUND", "There is no active round to stop.");
      }

      const refunds = await this.refundPendingBetsForCancelledRounds(tx, [activeRound], adminUserId);
      const round = await tx.gameRound.update({
        where: { id: activeRound.id },
        data: { status: RoundStatus.CANCELLED },
      });
      const cancelledBetCount = refunds.length;
      const refundedCoins = refunds.reduce((total, refund) => total + refund.amountCoins, 0);

      await tx.auditLog.create({
        data: {
          adminUserId,
          actionType: "ROUND_FORCE_STOP",
          targetType: "ROUND",
          targetId: round.id,
          metadata: auditMetadata({
            reason: dto.reason,
            roundNumber: round.roundNumber.toString(),
            cancelledBetCount,
            refundedCoins,
          }),
        },
      });

      return {
        round,
        refunds,
        cancelledBetCount,
        refundedCoins,
      };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });

    this.publishRefundWalletUpdates(refunds);
    await this.realMoneySettlementService.refundRound(round.id);
    const cancellationPayload = {
      round: {
        ...serializeRound(round),
        status: RoundStatus.CANCELLED,
      },
      remainingSeconds: 0,
      syncedAt: new Date().toISOString(),
      reason: dto.reason,
      refundedBetCount: refunds.length,
      refundedCoins: refunds.reduce((total, refund) => total + refund.amountCoins, 0),
    };
    publishGameEvent("round:cancelled", cancellationPayload);
    publishGameEvent("round:update", cancellationPayload);
    publishGameEvent("round:state", cancellationPayload);
    publishGameEvent("system:error", {
      code: "ADMIN_ROUND_FORCE_STOP",
      message: "Active round was stopped by an administrator.",
      roundId: round.id,
    });

    return {
      round: serializeAdminRound(
        { ...round, _count: { bets: 0 } },
        { reason: dto.reason, actorId: adminUserId },
      ),
    };
  }

  async forceResult(adminUserId: string, dto: ForceResultDto) {
    const activeRound = await this.prisma.$transaction(async (tx) => {
      const round = await tx.gameRound.findFirst({
        where: {
          status: {
            in: ACTIVE_ROUND_STATUSES,
          },
        },
        orderBy: { startTime: "desc" },
      });

      if (!round) {
        throw new HttpError(404, "ACTIVE_ROUND_NOT_FOUND", "There is no active round to resolve.");
      }

      if (round.result && round.result !== dto.result) {
        throw new HttpError(
          409,
          "ROUND_RESULT_CONFLICT",
          "The active round already has a different result.",
        );
      }

      await tx.gameRound.updateMany({
        where: {
          id: round.id,
          status: {
            in: ACTIVE_ROUND_STATUSES,
          },
        },
        data: {
          status: RoundStatus.RESOLVING,
          result: dto.result,
        },
      });

      return round;
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });

    const seedReveal = await this.getSeedReveal(activeRound.id);

    if (!this.resultService.seedHashMatches(seedReveal, activeRound.seedHash)) {
      publishGameEvent("system:error", {
        code: "ROUND_SEED_HASH_MISMATCH",
        message: "Durable round seed does not match the committed seed hash.",
        roundId: activeRound.id,
      });
      throw new HttpError(500, "ROUND_SEED_HASH_MISMATCH", "Round seed integrity check failed.");
    }

    const settlement = await this.settlementService.settleRound(activeRound.id, dto.result);
    const realMoneySettlement = await this.realMoneySettlementService.settleRound(activeRound.id, dto.result);

    const round = await this.prisma.gameRound.update({
      where: { id: activeRound.id },
      data: {
        status: RoundStatus.COMPLETED,
        result: dto.result,
        seedReveal,
      },
    });
    await this.gameRepository.markRoundSeedRevealed(round.id);

    await this.writeAuditLog(adminUserId, "ROUND_FORCE_RESULT", "ROUND", round.id, {
      result: dto.result,
      reason: dto.reason,
      settlement: { ...settlement },
      realMoneySettlement,
    });

    publishGameEvent("round:result", {
      round: serializeRound(round),
      result: dto.result,
      forced: true,
      settlement,
    });
    publishGameEvent("round:completed", {
      round: serializeRound(round),
      forced: true,
      settlement,
    });
    await clearRoundSeedReveal(round.id);

    return {
      round: serializeAdminRound({ ...round, _count: { bets: settlement.totalBets } }),
      settledBetCount: settlement.totalBets,
      totalPayoutCoins: settlement.totalPayoutCoins,
    };
  }

  async getGameControl() {
    const gameControl = await this.readGameControl(this.prisma);

    return {
      gameControl: serializeGameControl(gameControl),
    };
  }

  async pauseGame(adminUserId: string, dto: GamePauseDto) {
    const gameControl = await this.prisma.$transaction(async (tx) => {
      const control = await this.writeGameControl(tx, true, dto.reason, adminUserId);
      await tx.auditLog.create({
        data: {
          adminUserId,
          actionType: "GAME_PAUSE",
          targetType: "SYSTEM",
          targetId: "global",
          metadata: auditMetadata({
            reason: dto.reason,
          }),
        },
      });
      return control;
    });

    publishRealtimeEvent("game:paused", {
      gameControl: serializeGameControl(gameControl),
    });

    return {
      gameControl: serializeGameControl(gameControl),
    };
  }

  async resumeGame(adminUserId: string, dto: GameResumeDto) {
    const gameControl = await this.prisma.$transaction(async (tx) => {
      const control = await this.writeGameControl(tx, false, dto.reason ?? null, adminUserId);
      await tx.auditLog.create({
        data: {
          adminUserId,
          actionType: "GAME_RESUME",
          targetType: "SYSTEM",
          targetId: "global",
          metadata: auditMetadata({
            reason: dto.reason ?? null,
          }),
        },
      });
      return control;
    });

    publishRealtimeEvent("game:resumed", {
      gameControl: serializeGameControl(gameControl),
    });

    return {
      gameControl: serializeGameControl(gameControl),
    };
  }

  async getWallet(userId: string) {
    return this.walletService.getWalletBalance(userId);
  }

  async getLedger(userId: string, pagination: PaginationInput = { limit: 100 }) {
    const entries = await this.prisma.coinLedger.findMany({
      where: {
        userId,
        ...createdAtIdDescWhere(pagination.cursor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
    });
    const page = pageInfo(entries, pagination.limit, (entry) =>
      encodeCreatedAtIdCursor(entry.createdAt, entry.id),
    );

    return { entries: page.items.map(serializeAdminLedger), pageInfo: page.pageInfo };
  }

  async adjustWallet(adminUserId: string, userId: string, dto: AdminWalletAdjustmentDto) {
    const ledgerReferenceId = stableUuidFromIdempotencyKey(dto.idempotencyKey);
    const run = () => this.prisma.$transaction(async (tx) => {
      const result = await this.walletService.adminAdjustCoinsInTransaction(tx, {
        userId,
        amountCoins: dto.amountCoins,
        referenceId: ledgerReferenceId,
        idempotencyKey: dto.idempotencyKey,
        direction: dto.direction as CoinLedgerDirection,
      });

      if (!result.idempotentReplay) {
        await tx.auditLog.create({
          data: {
            adminUserId,
            actionType: "WALLET_ADMIN_ADJUSTMENT",
            idempotencyKey: dto.idempotencyKey,
            targetType: "USER",
            targetId: userId,
            metadata: auditMetadata({
              amountCoins: dto.amountCoins,
              direction: dto.direction,
              reason: dto.reason,
              ledgerReferenceId,
              idempotencyKeyHash: hashToken(dto.idempotencyKey).slice(0, 16),
              debitStrategy: dto.direction === "DEBIT" ? "DEPOSIT_FIRST_THEN_WINNINGS" : null,
            }),
          },
        });
      }

      return result;
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });

    let result;
    try {
      result = await run();
    } catch (error) {
      if (!isRetryableAdminAdjustmentError(error)) {
        throw error;
      }
      result = await run();
    }

    if ("wallet" in result && result.wallet) {
      this.walletService.publishWalletUpdate(userId, result.wallet, result.ledgerEntry);
    }

    return result;
  }

  async listBets(filters: { roundId?: string; userId?: string; pagination?: PaginationInput }) {
    const pagination = filters.pagination ?? { limit: 100 };
    const where: Prisma.BetWhereInput = {
      ...(filters.roundId ? { roundId: filters.roundId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...createdAtIdDescWhere(pagination.cursor),
    };

    const [bets, suspiciousUsers] = await Promise.all([
      this.prisma.bet.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pagination.limit + 1,
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
    const page = pageInfo(bets, pagination.limit, (bet) =>
      encodeCreatedAtIdCursor(bet.createdAt, bet.id),
    );

    return {
      bets: page.items.map(serializeAdminBet),
      suspiciousUsers,
      pageInfo: page.pageInfo,
    };
  }

  async getSystemHealth() {
    const [
      postgres,
      redis,
      activeRound,
      activeUsers,
      totals,
      highRiskUsers,
      recentHighSeverityFraud,
      gameControl,
    ] = await Promise.all([
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
      this.readGameControl(this.prisma),
    ]);

    return {
      status: postgres === "configured" && redis === "configured" ? "ok" : "degraded",
      activeUsers,
      dependencies: {
        postgres,
        redis,
      },
      gameControl: serializeGameControl(gameControl),
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

  async listAuditLogs(pagination: PaginationInput = { limit: 50 }) {
    const logs = await this.prisma.auditLog.findMany({
      where: createdAtIdDescWhere(pagination.cursor),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pagination.limit + 1,
    });
    const page = pageInfo(logs, pagination.limit, (log) =>
      encodeCreatedAtIdCursor(log.createdAt, log.id),
    );

    return { auditLogs: page.items.map(serializeAuditLog), pageInfo: page.pageInfo };
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
        metadata: metadata ? auditMetadata(metadata) : undefined,
      },
    });
  }

  private async readGameControl(
    client: PrismaClient | Prisma.TransactionClient,
  ) {
    await client.$executeRaw`
      INSERT INTO game_controls (id, paused)
      VALUES ('global', false)
      ON CONFLICT (id) DO NOTHING
    `;

    const rows = await client.$queryRaw<GameControlRecord[]>`
      SELECT
        id,
        paused,
        reason,
        updated_by::text AS "updatedBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM game_controls
      WHERE id = 'global'
      LIMIT 1
    `;

    const control = rows[0];

    if (!control) {
      throw new HttpError(500, "GAME_CONTROL_UNAVAILABLE", "Game control state is unavailable.");
    }

    return control;
  }

  private async writeGameControl(
    tx: Prisma.TransactionClient,
    paused: boolean,
    reason: string | null,
    adminUserId: string,
  ) {
    await tx.$executeRaw`
      INSERT INTO game_controls (id, paused, reason, updated_by)
      VALUES ('global', ${paused}, ${reason}, CAST(${adminUserId} AS uuid))
      ON CONFLICT (id) DO UPDATE SET
        paused = EXCLUDED.paused,
        reason = EXCLUDED.reason,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `;

    return this.readGameControl(tx);
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

  private async getSeedReveal(roundId: string) {
    const durableSeedReveal = await this.gameRepository.findDurableRoundSeedReveal(roundId);

    if (durableSeedReveal) {
      return durableSeedReveal;
    }

    const seedReveal = await readRoundSeedReveal(roundId);

    if (!seedReveal) {
      publishGameEvent("system:error", {
        code: "ROUND_SEED_REVEAL_MISSING",
        message: "Durable and cached round seed reveal are missing.",
        roundId,
      });
      throw new HttpError(500, "ROUND_SEED_REVEAL_MISSING", "Round seed reveal is missing.");
    }

    return seedReveal;
  }

  private async refundPendingBetsForCancelledRounds(
    tx: Prisma.TransactionClient,
    rounds: Array<{
      id: string;
      bets: Array<{
        id: string;
        userId: string;
        coinsStaked: bigint;
        choice: "RED" | "GREEN" | "VIOLET";
      }>;
    }>,
    adminUserId: string,
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

        await tx.auditLog.create({
          data: {
            adminUserId,
            actionType: "BET_REFUND",
            targetType: "BET",
            targetId: bet.id,
            metadata: auditMetadata({
              roundId: round.id,
              userId: bet.userId,
              amountCoins,
              reason: "ROUND_CANCELLED",
            }),
          },
        });

        if ("wallet" in refund && refund.wallet) {
          const { wallet, ledgerEntry } = refund;
          refunds.push({
            betId: bet.id,
            roundId: round.id,
            choice: bet.choice,
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
      publishGameEvent("bet:settled", {
        id: refund.betId,
        betId: refund.betId,
        userId: refund.userId,
        roundId: refund.roundId,
        choice: refund.choice,
        result: null,
        status: BetStatus.CANCELLED,
        stake: String(refund.amountCoins),
        coinsStaked: String(refund.amountCoins),
        payoutAmount: "0",
        netProfitLoss: "0",
        settledAt: new Date().toISOString(),
      });
    }
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readAuditReason(metadata: Prisma.JsonValue) {
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    typeof metadata.reason === "string"
  ) {
    return metadata.reason;
  }

  return null;
}

function serializeGameControl(control: GameControlRecord) {
  return {
    id: control.id,
    paused: control.paused,
    reason: control.reason,
    updatedBy: control.updatedBy,
    createdAt: control.createdAt.toISOString(),
    updatedAt: control.updatedAt.toISOString(),
  };
}

function stableUuidFromIdempotencyKey(idempotencyKey: string) {
  const bytes = crypto.createHash("sha256").update(idempotencyKey).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex").slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function isRetryableAdminAdjustmentError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034");
}

function auditMetadata(metadata: Prisma.InputJsonValue) {
  return redactSensitiveData(metadata) as Prisma.InputJsonValue;
}
