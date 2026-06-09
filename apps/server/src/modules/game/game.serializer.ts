import { RoundStatus, type Bet, type GameRound } from "@prisma/client";

export function serializeRound(round: GameRound) {
  return {
    id: round.id,
    roundNumber: round.roundNumber.toString(),
    startTime: round.startTime.toISOString(),
    lockTime: round.lockTime.toISOString(),
    endTime: round.endTime.toISOString(),
    status: round.status,
    phase: toPlayablePhase(round.status),
    result: round.result,
    seedHash: round.seedHash,
    seedReveal: round.seedReveal,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  };
}

function toPlayablePhase(status: RoundStatus) {
  switch (status) {
    case RoundStatus.INIT:
      return "IDLE";
    case RoundStatus.OPEN:
      return "BETTING_OPEN";
    case RoundStatus.LOCKED:
      return "BETTING_CLOSED";
    case RoundStatus.RESOLVING:
      return "RESULT_CALCULATING";
    case RoundStatus.COMPLETED:
      return "RESULT_DECLARED";
    case RoundStatus.CANCELLED:
      return "IDLE";
  }
}

export function serializeBet(bet: Bet) {
  return {
    id: bet.id,
    userId: bet.userId,
    roundId: bet.roundId,
    choice: bet.choice,
    coinsStaked: bet.coinsStaked.toString(),
    status: bet.status,
    payoutAmount: bet.payoutAmount.toString(),
    createdAt: bet.createdAt.toISOString(),
    updatedAt: bet.updatedAt.toISOString(),
  };
}
