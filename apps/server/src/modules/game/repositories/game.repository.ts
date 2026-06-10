import {
  BetStatus,
  PredictionColor,
  Prisma,
  RoundStatus,
  type Bet,
  type GameRound,
  type PrismaClient,
} from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export interface GameControlRecord {
  id: string;
  paused: boolean;
  reason: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RoundCreateInput {
  roundNumber: bigint;
  startTime: Date;
  lockTime: Date;
  endTime: Date;
  seedHash: string;
  seedReveal: string;
}

interface PendingBetInput {
  userId: string;
  roundId: string;
  choice: PredictionColor;
  coinsStaked: bigint;
  idempotencyKey: string;
}

export class GameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<TResult>(handler: (tx: TxClient) => Promise<TResult>) {
    return this.prisma.$transaction(handler, {
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 15000,
    });
  }

  findCurrentRound() {
    return this.prisma.gameRound.findFirst({
      where: {
        status: {
          in: [RoundStatus.INIT, RoundStatus.OPEN, RoundStatus.LOCKED, RoundStatus.RESOLVING],
        },
      },
      orderBy: { startTime: "desc" },
    });
  }

  findCurrentRoundInTx(tx: TxClient) {
    return tx.gameRound.findFirst({
      where: {
        status: {
          in: [RoundStatus.INIT, RoundStatus.OPEN, RoundStatus.LOCKED, RoundStatus.RESOLVING],
        },
      },
      orderBy: { startTime: "desc" },
    });
  }

  findLatestRound() {
    return this.prisma.gameRound.findFirst({
      orderBy: { roundNumber: "desc" },
    });
  }

  createRound(tx: TxClient, input: RoundCreateInput) {
    return tx.gameRound.create({
      data: {
        roundNumber: input.roundNumber,
        startTime: input.startTime,
        lockTime: input.lockTime,
        endTime: input.endTime,
        status: RoundStatus.INIT,
        seedHash: input.seedHash,
        seedReveal: input.seedReveal,
      },
    });
  }

  async getGameControl() {
    await this.prisma.$executeRaw`
      INSERT INTO game_controls (id, paused)
      VALUES ('global', false)
      ON CONFLICT (id) DO NOTHING
    `;

    const rows = await this.prisma.$queryRaw<GameControlRecord[]>`
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

    return rows[0] ?? null;
  }

  updateRoundStatus(
    roundId: string,
    fromStatus: RoundStatus,
    toStatus: RoundStatus,
    data: Partial<Pick<GameRound, "result" | "seedReveal">> = {},
  ) {
    return this.prisma.gameRound.updateMany({
      where: {
        id: roundId,
        status: fromStatus,
      },
      data: {
        ...data,
        status: toStatus,
      },
    });
  }

  updateRoundStatusInTx(
    tx: TxClient,
    roundId: string,
    fromStatus: RoundStatus,
    toStatus: RoundStatus,
  ) {
    return tx.gameRound.updateMany({
      where: {
        id: roundId,
        status: fromStatus,
      },
      data: {
        status: toStatus,
      },
    });
  }

  findRoundById(roundId: string) {
    return this.prisma.gameRound.findUnique({
      where: { id: roundId },
    });
  }

  async lockOpenRoundForBet(tx: TxClient, roundId: string) {
    const rounds = await tx.$queryRaw<GameRound[]>`
      SELECT *
      FROM game_rounds
      WHERE round_id = CAST(${roundId} AS uuid)
        AND status = 'OPEN'
        AND now() < lock_time
      FOR UPDATE
    `;

    return rounds[0] ?? null;
  }

  createPendingBet(tx: TxClient, input: PendingBetInput) {
    return tx.bet.create({
      data: {
        userId: input.userId,
        roundId: input.roundId,
        choice: input.choice,
        coinsStaked: input.coinsStaked,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  findBetByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.bet.findUnique({
      where: { idempotencyKey },
    });
  }

  deletePendingBet(betId: string) {
    return this.prisma.bet.deleteMany({
      where: {
        id: betId,
        status: BetStatus.PENDING,
      },
    });
  }

  updateBetStatus(
    betId: string,
    status: BetStatus,
    payoutAmount: bigint = 0n,
  ) {
    return this.prisma.bet.update({
      where: { id: betId },
      data: {
        status,
        payoutAmount,
      },
    });
  }

  async updatePendingBetStatusInTx(
    tx: TxClient,
    betId: string,
    status: BetStatus,
    payoutAmount: bigint = 0n,
  ) {
    const updated = await tx.bet.updateMany({
      where: {
        id: betId,
        status: BetStatus.PENDING,
      },
      data: {
        status,
        payoutAmount,
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return tx.bet.findUnique({
      where: { id: betId },
    });
  }

  findPendingBetsForRound(roundId: string) {
    return this.prisma.bet.findMany({
      where: {
        roundId,
        status: BetStatus.PENDING,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async beginRoundSettlementInTx(
    tx: TxClient,
    roundId: string,
    result: PredictionColor,
  ) {
    await tx.$executeRaw`
      INSERT INTO round_settlements (round_id, result, status, started_at, updated_at)
      VALUES (CAST(${roundId} AS uuid), ${result}::"PredictionColor", 'PENDING', now(), now())
      ON CONFLICT (round_id) DO NOTHING
    `;

    const rows = await tx.$queryRaw<RoundSettlementState[]>`
      SELECT result, status
      FROM round_settlements
      WHERE round_id = CAST(${roundId} AS uuid)
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  markLosingBetsForRound(roundId: string, result: PredictionColor) {
    return this.prisma.bet.updateMany({
      where: {
        roundId,
        status: BetStatus.PENDING,
        choice: {
          not: result,
        },
      },
      data: {
        status: BetStatus.LOST,
        payoutAmount: 0n,
      },
    });
  }

  async findPendingWinnerPayouts(
    roundId: string,
    result: PredictionColor,
    payoutMultiplier: number,
    limit: number,
  ) {
    return this.prisma.$queryRaw<WinnerPayoutRow[]>`
      SELECT
        user_id::text AS "userId",
        COUNT(*)::int AS "betCount",
        COALESCE(SUM(coins_staked * ${payoutMultiplier}), 0)::bigint AS "totalPayoutCoins"
      FROM bets
      WHERE round_id = CAST(${roundId} AS uuid)
        AND status = 'PENDING'
        AND choice = ${result}::"PredictionColor"
      GROUP BY user_id
      ORDER BY user_id
      LIMIT ${limit}
    `;
  }

  async lockPendingWinnerBetsForUserInTx(
    tx: TxClient,
    roundId: string,
    result: PredictionColor,
    userId: string,
  ) {
    const rows = await tx.$queryRaw<Bet[]>`
      SELECT
        id,
        user_id AS "userId",
        round_id AS "roundId",
        choice,
        coins_staked AS "coinsStaked",
        idempotency_key AS "idempotencyKey",
        status,
        payout_amount AS "payoutAmount",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM bets
      WHERE round_id = CAST(${roundId} AS uuid)
        AND user_id = CAST(${userId} AS uuid)
        AND status = 'PENDING'
        AND choice = ${result}::"PredictionColor"
      FOR UPDATE
    `;

    return rows;
  }

  async markWinnerBetsSettledInTx(
    tx: TxClient,
    betIds: string[],
    payoutMultiplier: number,
  ) {
    if (betIds.length === 0) {
      return [];
    }

    await tx.$executeRaw`
      UPDATE bets
      SET
        status = 'WON',
        payout_amount = coins_staked * ${payoutMultiplier},
        updated_at = now()
      WHERE id IN (${Prisma.join(betIds)})
        AND status = 'PENDING'
    `;

    return tx.bet.findMany({
      where: {
        id: {
          in: betIds,
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async getRoundSettlementStats(roundId: string) {
    const rows = await this.prisma.$queryRaw<SettlementStatsRow[]>`
      SELECT
        COUNT(*)::int AS "totalBets",
        COUNT(*) FILTER (WHERE status = 'WON')::int AS "winningBets",
        COUNT(*) FILTER (WHERE status = 'LOST')::int AS "losingBets",
        COALESCE(SUM(payout_amount) FILTER (WHERE status = 'WON'), 0)::bigint AS "totalPayoutCoins",
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS "pendingBets"
      FROM bets
      WHERE round_id = CAST(${roundId} AS uuid)
    `;

    return rows[0] ?? {
      totalBets: 0,
      winningBets: 0,
      losingBets: 0,
      totalPayoutCoins: 0n,
      pendingBets: 0,
    };
  }

  async completeRoundSettlement(
    roundId: string,
    result: PredictionColor,
    stats: SettlementStatsRow,
    metadata: Prisma.InputJsonObject,
  ) {
    const serializedMetadata = JSON.stringify(metadata);

    await this.prisma.$executeRaw`
      INSERT INTO round_settlements (
        round_id,
        result,
        status,
        total_bets,
        winning_bets,
        losing_bets,
        total_payout_coins,
        metadata,
        started_at,
        completed_at,
        updated_at
      )
      VALUES (
        CAST(${roundId} AS uuid),
        ${result}::"PredictionColor",
        'SUCCESS',
        ${stats.totalBets},
        ${stats.winningBets},
        ${stats.losingBets},
        ${stats.totalPayoutCoins},
        ${serializedMetadata}::jsonb,
        now(),
        now(),
        now()
      )
      ON CONFLICT (round_id) DO UPDATE SET
        result = EXCLUDED.result,
        status = 'SUCCESS',
        total_bets = EXCLUDED.total_bets,
        winning_bets = EXCLUDED.winning_bets,
        losing_bets = EXCLUDED.losing_bets,
        total_payout_coins = EXCLUDED.total_payout_coins,
        metadata = EXCLUDED.metadata,
        completed_at = now(),
        updated_at = now()
    `;
  }

  findRoundHistory(limit = 30) {
    return this.prisma.gameRound.findMany({
      where: {
        status: {
          in: [RoundStatus.COMPLETED, RoundStatus.CANCELLED],
        },
      },
      orderBy: { startTime: "desc" },
      take: limit,
      include: {
        _count: {
          select: {
            bets: true,
          },
        },
      },
    });
  }

  findUserBetHistory(userId: string, limit = 50) {
    return this.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        round: {
          select: {
            roundNumber: true,
            status: true,
            result: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });
  }
}

export type GameRoundRecord = GameRound;
export type BetRecord = Bet;
export interface WinnerPayoutRow {
  userId: string;
  betCount: number;
  totalPayoutCoins: bigint;
}

export interface SettlementStatsRow {
  totalBets: number;
  winningBets: number;
  losingBets: number;
  totalPayoutCoins: bigint;
  pendingBets: number;
}

export interface RoundSettlementState {
  result: PredictionColor;
  status: string;
}
