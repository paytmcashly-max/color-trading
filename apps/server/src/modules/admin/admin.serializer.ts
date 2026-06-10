import type {
  AuditLog,
  Bet,
  CoinLedger,
  FraudLog,
  GameRound,
  User,
  UserRiskProfile,
  Wallet,
} from "@prisma/client";

export function serializeAdminUser(
  user: Pick<User, "id" | "email" | "displayName" | "role" | "status" | "emailVerifiedAt" | "lastLoginAt" | "createdAt" | "updatedAt"> & {
    wallet?: Pick<Wallet, "depositBalance" | "winningBalance" | "status" | "ledgerVersion"> | null;
    _count?: { bets: number; ledgerEntries: number };
  },
) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    wallet: user.wallet
      ? {
          depositBalance: user.wallet.depositBalance.toString(),
          winningBalance: user.wallet.winningBalance.toString(),
          totalBalance: (user.wallet.depositBalance + user.wallet.winningBalance).toString(),
          status: user.wallet.status,
          ledgerVersion: user.wallet.ledgerVersion.toString(),
        }
      : null,
    counts: user._count
      ? {
          bets: user._count.bets,
          ledgerEntries: user._count.ledgerEntries,
        }
      : undefined,
  };
}

export function serializeAdminRound(
  round: Pick<GameRound, "id" | "roundNumber" | "startTime" | "lockTime" | "endTime" | "status" | "result" | "seedHash" | "seedReveal" | "createdAt" | "updatedAt"> & {
    _count?: { bets: number };
  },
) {
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
    betCount: round._count?.bets ?? 0,
  };
}

export function serializeAdminBet(
  bet: Pick<Bet, "id" | "userId" | "roundId" | "choice" | "coinsStaked" | "status" | "payoutAmount" | "createdAt" | "updatedAt"> & {
    user?: Pick<User, "email" | "displayName">;
    round?: Pick<GameRound, "roundNumber" | "status">;
  },
) {
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
    user: bet.user
      ? {
          email: bet.user.email,
          displayName: bet.user.displayName,
        }
      : undefined,
    round: bet.round
      ? {
          roundNumber: bet.round.roundNumber.toString(),
          status: bet.round.status,
        }
      : undefined,
  };
}

export function serializeAdminLedger(
  entry: Pick<CoinLedger, "id" | "userId" | "walletId" | "type" | "direction" | "amountCoins" | "balanceBeforeCoins" | "balanceAfterCoins" | "idempotencyKey" | "referenceType" | "referenceId" | "status" | "metadata" | "createdAt" | "updatedAt">,
) {
  return {
    id: entry.id,
    userId: entry.userId,
    walletId: entry.walletId,
    type: entry.type,
    direction: entry.direction,
    amountCoins: entry.amountCoins.toString(),
    balanceBeforeCoins: entry.balanceBeforeCoins?.toString() ?? null,
    balanceAfterCoins: entry.balanceAfterCoins?.toString() ?? null,
    idempotencyKey: entry.idempotencyKey,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    status: entry.status,
    metadata: entry.metadata,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function serializeAuditLog(log: AuditLog) {
  return {
    id: log.id,
    adminUserId: log.adminUserId,
    actionType: log.actionType,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
  };
}

export function serializeFraudLog(log: FraudLog) {
  return {
    id: log.id,
    userId: log.userId,
    eventType: log.eventType,
    severity: log.severity,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
  };
}

export function serializeRiskProfile(
  profile: UserRiskProfile & {
    user?: Pick<User, "email" | "displayName" | "status">;
  },
) {
  return {
    userId: profile.userId,
    riskScore: profile.riskScore,
    isBlocked: profile.isBlocked,
    botSuspected: profile.botSuspected,
    lastUpdated: profile.lastUpdated.toISOString(),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    user: profile.user
      ? {
          email: profile.user.email,
          displayName: profile.user.displayName,
          status: profile.user.status,
        }
      : undefined,
  };
}
