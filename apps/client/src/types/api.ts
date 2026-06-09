import type { BetStatus, PredictionColor, RoundStatus, UserRole, UserStatus } from "@color-trading/shared";

export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
}

export interface AuthResponse {
  user: UserDto;
  tokens: TokenPair;
}

export interface WalletDto {
  id: string;
  userId: string;
  depositBalance: string;
  winningBalance: string;
  totalBalance: string;
  ledgerVersion: string;
  status: string;
  createdAt?: string;
  updatedAt: string;
}

export interface RoundDto {
  id: string;
  roundNumber: string;
  startTime: string;
  lockTime: string;
  endTime: string;
  status: RoundStatus;
  phase?: "IDLE" | "BETTING_OPEN" | "BETTING_CLOSED" | "RESULT_CALCULATING" | "RESULT_DECLARED";
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
  choice: PredictionColor;
  coinsStaked: string;
  status: BetStatus;
  payoutAmount: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntryDto {
  id: string;
  userId?: string;
  walletId?: string;
  type: string;
  direction: string;
  amountCoins: string;
  balanceAfterCoins: string | null;
  idempotencyKey?: string;
  referenceType?: string | null;
  status: string;
  referenceId: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminUserDto extends UserDto {
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
