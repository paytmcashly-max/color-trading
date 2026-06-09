import type { Bet, GameRound } from "@prisma/client";

export function serializeRound(round: GameRound) {
  return {
    id: round.id,
    roundNumber: round.roundNumber.toString(),
    startTime: round.startTime.toISOString(),
    lockTime: round.lockTime.toISOString(),
    endTime: round.endTime.toISOString(),
    status: round.status,
    result: round.result,
    seedHash: round.seedHash,
    seedReveal: round.seedReveal,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  };
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
