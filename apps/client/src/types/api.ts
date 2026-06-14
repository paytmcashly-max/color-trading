import type {
  AuthSession,
  AuthTokenPair,
  AuthUser,
  BetStatus,
  PredictionColor,
  RoundLifecycleStatus,
  RoundStatus,
  WalletBalance,
  WalletTransaction,
  PaymentIntentDto,
  PremiumCreditWalletDto,
  PremiumCreditLedgerDto,
} from "@color-trading/shared";

export type UserDto = AuthUser;

export type TokenPair = AuthTokenPair;

export type AuthResponse = AuthSession;

export type WalletDto = WalletBalance;
export type { PaymentIntentDto, PremiumCreditWalletDto, PremiumCreditLedgerDto };

export interface RoundDto {
  id: string;
  roundNumber: string;
  startedAt?: string;
  endedAt?: string;
  startTime: string;
  lockTime: string;
  endTime: string;
  status: RoundStatus | RoundLifecycleStatus;
  dbStatus?: RoundStatus;
  phase?: RoundLifecycleStatus;
  result: PredictionColor | null;
  seedHash: string;
  seedReveal: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BetDto {
  id: string;
  userId: string;
  roundId: string;
  roundNumber?: string;
  choice: PredictionColor;
  selection?: PredictionColor;
  amount?: string;
  coinsStaked: string;
  status: BetStatus;
  payoutAmount: string;
  netProfitLoss?: string | null;
  settledAt?: string | null;
  result?: PredictionColor | null;
  stake?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserBetHistoryDto extends BetDto {
  betId?: string;
  roundNumber?: string;
  stakeAmount?: string;
  displayStatus?: BetStatus | "REFUNDED";
  roundStartTime?: string;
  roundEndTime?: string;
  round?: {
    roundNumber: string;
    status: RoundStatus;
    result: PredictionColor | null;
    startTime: string;
    endTime: string;
  };
}

export interface RoundHistoryDto extends RoundDto {
  betCount: number;
}

export interface LeaderboardUserDto {
  rank: number;
  userId: string;
  email: string;
  displayName: string | null;
  depositBalance: string;
  winningBalance: string;
  totalBalance: string;
}

export interface LedgerEntryDto {
  id: string;
  userId?: string;
  walletId?: string;
  type: string;
  direction: string;
  amountCoins: string;
  balanceBeforeCoins: string | null;
  balanceAfterCoins: string | null;
  idempotencyKey?: string;
  referenceType?: string | null;
  status: string;
  referenceId: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt?: string;
}

export type WalletTransactionDto = WalletTransaction;

export interface PageInfoDto {
  limit: number;
  nextCursor: string | null;
}

export interface AdminUserDto extends UserDto {
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  wallet: {
    depositBalance: string;
    winningBalance: string;
    totalBalance: string;
    status: string;
    ledgerVersion: string;
  } | null;
  counts?: {
    bets: number;
    ledgerEntries: number;
  };
}

export interface AdminRoundDto extends RoundDto {
  betCount: number;
  pendingSettlement?: boolean;
  settlementWarning?: string | null;
  exposure?: Array<{
    choice: PredictionColor;
    betCount: number;
    coinsStaked: string;
  }>;
  cancellation: {
    reason: string | null;
    actorId: string | null;
  } | null;
}

export interface AdminBetDto extends BetDto {
  user?: {
    email: string;
    displayName: string | null;
  };
  round?: {
    roundNumber: string;
    status: string;
  };
}

export interface AuditLogDto {
  id: string;
  adminUserId: string;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AdminSystemHealthDto {
  status: "ok" | "degraded";
  activeUsers: number;
  dependencies: {
    postgres: string;
    redis: string;
  };
  currentRound: AdminRoundDto | null;
  totals: {
    users: number;
    rounds: number;
    bets: number;
    ledgerEntries: number;
  };
  fraud?: {
    highRiskUsers: number;
    recentHighSeverityFraud: number;
  };
  observability?: {
    activeSockets: number;
    activeUsers: number;
    currentRoundId: string | null;
    betsPerMinute: number;
    walletTransactionsPerMinute: number;
    errorRatePerMinute: number;
    averageHttpLatencyMs: number;
    timestamp: string;
  };
  timestamp: string;
}

export interface SuspiciousBettingPatternDto {
  userId: string;
  betCountLastHour: number;
  coinsStakedLastHour: string;
}

export interface FraudLogDto {
  id: string;
  userId: string | null;
  eventType: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  metadata: unknown;
  createdAt: string;
}

export interface RiskProfileDto {
  userId: string;
  riskScore: number;
  isBlocked: boolean;
  botSuspected: boolean;
  lastUpdated: string;
  user?: {
    email: string;
    displayName: string | null;
    status: string;
  };
}
