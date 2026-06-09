import { RoundStatus, type Bet, type GameRound } from "@prisma/client";

export function serializeRound(round: GameRound) {
  const lifecycleStatus = toRealtimeRoundStatus(round.status);

  return {
    id: round.id,
    roundNumber: round.roundNumber.toString(),
    startedAt: round.startTime.toISOString(),
    endedAt: round.endTime.toISOString(),
    startTime: round.startTime.toISOString(),
    lockTime: round.lockTime.toISOString(),
    endTime: round.endTime.toISOString(),
    status: lifecycleStatus,
    dbStatus: round.status,
    phase: lifecycleStatus,
    result: round.result,
    seedHash: round.seedHash,
    seedReveal: round.seedReveal,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  };
}

function toRealtimeRoundStatus(status: RoundStatus) {
  switch (status) {
    case RoundStatus.INIT:
      return "BETTING_OPEN";
    case RoundStatus.OPEN:
      return "BETTING_OPEN";
    case RoundStatus.LOCKED:
      return "BETTING_CLOSED";
    case RoundStatus.RESOLVING:
      return "BETTING_CLOSED";
    case RoundStatus.COMPLETED:
      return "RESULT_DECLARED";
    case RoundStatus.CANCELLED:
      return "RESULT_DECLARED";
  }
}

export function serializeBet(bet: Bet) {
  return {
    id: bet.id,
    userId: bet.userId,
    roundId: bet.roundId,
    choice: bet.choice,
    selection: bet.choice,
    amount: bet.coinsStaked.toString(),
    coinsStaked: bet.coinsStaked.toString(),
    status: bet.status,
    payoutAmount: bet.payoutAmount.toString(),
    createdAt: bet.createdAt.toISOString(),
    updatedAt: bet.updatedAt.toISOString(),
  };
}

export function serializeRoundHistory(
  round: GameRound & {
    _count?: { bets: number };
  },
) {
  return {
    ...serializeRound(round),
    betCount: round._count?.bets ?? 0,
  };
}

export function serializeUserBetHistory(
  bet: Bet & {
    round?: Pick<GameRound, "roundNumber" | "status" | "result" | "startTime" | "endTime">;
  },
) {
  return {
    ...serializeBet(bet),
    round: bet.round
      ? {
          roundNumber: bet.round.roundNumber.toString(),
          status: bet.round.status,
          result: bet.round.result,
          startTime: bet.round.startTime.toISOString(),
          endTime: bet.round.endTime.toISOString(),
        }
      : undefined,
  };
}
