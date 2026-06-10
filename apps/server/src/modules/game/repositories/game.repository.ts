import {
  BetStatus,
  PredictionColor,
  RoundStatus,
  type Bet,
  type GameRound,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

type TxClient = Prisma.TransactionClient;

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

  findPendingBetsForRound(roundId: string) {
    return this.prisma.bet.findMany({
      where: {
        roundId,
        status: BetStatus.PENDING,
      },
      orderBy: { createdAt: "asc" },
    });
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
