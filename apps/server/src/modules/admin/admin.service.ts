import {
  BetStatus,
  CoinLedgerDirection,
  RoundStatus,
  UserStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { HttpError } from "../../common/errors/http-error.js";
import { pageInfo, type PaginationInput } from "../../common/utils/pagination.js";
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
import { GameRepository } from "../game/repositories/game.repository.js";
import { SettlementService } from "../game/services/settlement.service.js";
import { publishRealtimeEvent } from "../../sockets/socket.events.js";
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

  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletService: WalletService,
  ) {
    this.settlementService = new SettlementService(new GameRepository(prisma), walletService);
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
          metadata: {
            email: suspendedUser.email,
            revokedSessionCount: revokedSessions.count,
          },
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

      return {
        round,
        refunds,
        cancelledBetCount: refunds.length,
        refundedCoins: refunds.reduce((total, refund) => total + refund.amountCoins, 0),
      };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 });

    await storeRoundSeedReveal(round.id, seed.seedReveal);

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

      const refunds = await this.refundPendingBetsForCancelledRounds(tx, [activeRound], adminUserId);
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

    const seedReveal = activeRound.seedReveal ?? (await this.getSeedReveal(activeRound.id));
    const settlement = await this.settlementService.settleRound(activeRound.id, dto.result);

    const round = await this.prisma.gameRound.update({
      where: { id: activeRound.id },
      data: {
        status: RoundStatus.COMPLETED,
        result: dto.result,
        seedReveal,
      },
    });

    await this.writeAuditLog(adminUserId, "ROUND_FORCE_RESULT", "ROUND", round.id, {
      result: dto.result,
      reason: dto.reason,
      settlement: { ...settlement },
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
          metadata: {
            reason: dto.reason,
          },
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
          metadata: {
            reason: dto.reason ?? null,
          },
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
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });
    const page = pageInfo(entries, pagination.limit, (entry) => entry.id);

    return { entries: page.items.map(serializeAdminLedger), pageInfo: page.pageInfo };
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

  async listBets(filters: { roundId?: string; userId?: string; pagination?: PaginationInput }) {
    const pagination = filters.pagination ?? { limit: 100 };
    const where: Prisma.BetWhereInput = {
      ...(filters.roundId ? { roundId: filters.roundId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    };

    const [bets, suspiciousUsers] = await Promise.all([
      this.prisma.bet.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pagination.limit + 1,
        ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
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
    const page = pageInfo(bets, pagination.limit, (bet) => bet.id);

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
    const seedReveal = await readRoundSeedReveal(roundId);

    if (!seedReveal) {
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
            metadata: {
              roundId: round.id,
              userId: bet.userId,
              amountCoins,
              reason: "ROUND_CANCELLED",
            },
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
