import { RoundStatus, type Bet, type GameRound } from "@prisma/client";
import type { RoundEngineStatus, RoundLifecycleStatus } from "@color-trading/shared";

export function serializeRound(round: GameRound) {
  const lifecycleStatus = toRealtimeRoundStatus(round.status);
  const engineStatus = toRoundEngineStatus(round.status);

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
    lifecycleStatus: engineStatus,
    engineStatus,
    result: round.result,
    seedHash: round.seedHash,
    seedReveal: canExposeSeedReveal(round.status) ? round.seedReveal : null,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  };
}

export function canExposeSeedReveal(status: RoundStatus) {
  return status === RoundStatus.COMPLETED || status === RoundStatus.CANCELLED;
}

function toRoundEngineStatus(status: RoundStatus): RoundEngineStatus {
  switch (status) {
    case RoundStatus.INIT:
      return "WAITING";
    case RoundStatus.OPEN:
      return "BETTING";
    case RoundStatus.LOCKED:
      return "LOCKED";
    case RoundStatus.RESOLVING:
      return "RESULT";
    case RoundStatus.COMPLETED:
      return "SETTLED";
    case RoundStatus.CANCELLED:
      return "SETTLED";
  }
}

function toRealtimeRoundStatus(status: RoundStatus): RoundLifecycleStatus {
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
  const netProfitLoss = calculateNetProfitLoss(
    bet.status,
    bet.coinsStaked,
    bet.payoutAmount,
  );

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
    netProfitLoss: netProfitLoss?.toString() ?? null,
    settledAt: bet.status === "PENDING" ? null : bet.updatedAt.toISOString(),
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
    betId: bet.id,
    roundNumber: bet.round?.roundNumber.toString(),
    result: bet.round?.result ?? null,
    stake: bet.coinsStaked.toString(),
    stakeAmount: bet.coinsStaked.toString(),
    displayStatus: bet.status === "CANCELLED" ? "REFUNDED" : bet.status,
    roundStartTime: bet.round?.startTime.toISOString(),
    roundEndTime: bet.round?.endTime.toISOString(),
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

export function serializeSettledBet(bet: Bet, result: Bet["choice"] | null) {
  return {
    ...serializeBet(bet),
    betId: bet.id,
    result,
    stake: bet.coinsStaked.toString(),
  };
}

function calculateNetProfitLoss(
  status: Bet["status"],
  stake: bigint,
  payoutAmount: bigint,
) {
  switch (status) {
    case "PENDING":
      return null;
    case "WON":
      return payoutAmount - stake;
    case "LOST":
      return -stake;
    case "CANCELLED":
      return 0n;
  }
}
