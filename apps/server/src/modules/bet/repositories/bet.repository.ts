import {
  BetStatus,
  type Bet,
  type GameRound,
  type PredictionColor,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

type TxClient = Prisma.TransactionClient;

interface PendingBetInput {
  userId: string;
  roundId: string;
  choice: PredictionColor;
  coinsStaked: bigint;
  idempotencyKey: string;
}

export interface BetRepositoryPort {
  transaction<TResult>(handler: (tx: TxClient) => Promise<TResult>): Promise<TResult>;
  lockOpenRoundForBet(tx: TxClient, roundId: string): Promise<GameRound | null>;
  createPendingBet(tx: TxClient, input: PendingBetInput): Promise<Bet>;
  findBetByIdempotencyKey(idempotencyKey: string): Promise<Bet | null>;
  findUserBets(userId: string, limit?: number): Promise<Bet[]>;
}

export class BetRepository implements BetRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<TResult>(handler: (tx: TxClient) => Promise<TResult>) {
    return this.prisma.$transaction(handler, {
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 15000,
    });
  }

  async lockOpenRoundForBet(tx: TxClient, roundId: string) {
    const rounds = await tx.$queryRaw<GameRound[]>`
      SELECT *
      FROM game_rounds
      WHERE round_id = CAST(${roundId} AS uuid)
        AND status = 'OPEN'
        AND now() < lock_time
        AND NOT EXISTS (
          SELECT 1
          FROM game_controls
          WHERE id = 'global'
            AND paused = true
        )
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
        status: BetStatus.PENDING,
      },
    });
  }

  findBetByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.bet.findUnique({
      where: { idempotencyKey },
    });
  }

  findUserBets(userId: string, limit = 50) {
    return this.prisma.bet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
