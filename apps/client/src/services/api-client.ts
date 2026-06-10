import type {
  AdminBetDto,
  AdminRoundDto,
  AdminSystemHealthDto,
  AdminUserDto,
  AuditLogDto,
  AuthResponse,
  BetDto,
  LedgerEntryDto,
  LeaderboardUserDto,
  RoundHistoryDto,
  RoundDto,
  FraudLogDto,
  RiskProfileDto,
  SuspiciousBettingPatternDto,
  UserBetHistoryDto,
  WalletDto,
  WalletTransactionDto,
} from "@/types/api";
import { useAuthStore } from "@/store/auth-store";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api/v1";

interface ApiErrorBody {
  success?: boolean;
  message?: string;
  data?: {
    code?: string;
    message?: string;
    details?: Record<string, string[] | undefined>;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

type ValidationDetails = Record<string, string[] | undefined>;

async function request<TResponse>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
  allowRefreshRetry = true,
) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401 && allowRefreshRetry && canRefreshAfterUnauthorized(path)) {
    try {
      const refreshed = await request<AuthResponse>(
        apiPath("/auth/refresh"),
        { method: "POST" },
        undefined,
        false,
      );
      useAuthStore.getState().setSession(refreshed.user, refreshed.tokens);
      return request<TResponse>(path, options, refreshed.tokens.accessToken, false);
    } catch {
      clearSessionAndRedirect();
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(
      body?.error?.message ??
        body?.data?.message ??
        formatValidationDetails(body?.data?.details) ??
        body?.message ??
        `Request failed with status ${response.status}`,
    );
  }

  const body = await response.json();

  if (isEnvelope(body)) {
    if (body.success === false) {
      throw new Error(body.message ?? "Request failed.");
    }

    return body.data as TResponse;
  }

  return body as TResponse;
}

function isEnvelope(value: unknown): value is { success: boolean; message?: string; data: unknown } {
  return typeof value === "object" && value !== null && "success" in value && "data" in value;
}

function canRefreshAfterUnauthorized(path: string) {
  return ![
    apiPath("/auth/login"),
    apiPath("/auth/register"),
    apiPath("/auth/refresh"),
  ].includes(path);
}

function clearSessionAndRedirect() {
  useAuthStore.getState().clearSession();

  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }
}

function formatValidationDetails(details: ValidationDetails | undefined) {
  if (!details) {
    return null;
  }

  const messages = Object.entries(details)
    .flatMap(([field, fieldMessages]) =>
      (fieldMessages ?? []).map((message) => `${formatFieldName(field)}: ${message}`),
    );

  return messages.length > 0 ? messages.join(" ") : null;
}

function formatFieldName(field: string) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function fetchHealth() {
  return request<unknown>("/health");
}

function apiPath(path: string) {
  return `${apiBasePath}${path}`;
}

export function login(email: string, password: string) {
  return request<AuthResponse>(apiPath("/auth/login"), {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string, displayName?: string) {
  return request<AuthResponse>(apiPath("/auth/register"), {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function refreshSession() {
  return request<AuthResponse>(apiPath("/auth/refresh"), {
    method: "POST",
  });
}

export function fetchMe(accessToken: string) {
  return request<{ user: AuthResponse["user"] }>(apiPath("/auth/me"), {}, accessToken);
}

export function logout(accessToken: string) {
  return request<{ success: true }>(apiPath("/auth/logout"), { method: "POST" }, accessToken);
}

export function logoutAllSessions(accessToken: string) {
  return request<{ success: true; revokedSessionCount: number }>(
    apiPath("/auth/logout-all"),
    { method: "POST" },
    accessToken,
  );
}

export function fetchWallet(accessToken: string) {
  return request<{ wallet: WalletDto }>(apiPath("/wallet/balance"), {}, accessToken);
}

export function fetchLedger(accessToken: string, input: PaginationParams = {}) {
  return request<{ entries: LedgerEntryDto[]; pageInfo: PageInfo }>(
    apiPath(`/wallet/ledger${paginationSuffix(input)}`),
    {},
    accessToken,
  );
}

export function fetchWalletTransactions(accessToken: string, input: PaginationParams = {}) {
  return request<{ transactions: WalletTransactionDto[]; pageInfo: PageInfo }>(
    apiPath(`/wallet/transactions${paginationSuffix(input)}`),
    {},
    accessToken,
  );
}

export function fetchCurrentRound() {
  return request<{ round: RoundDto | null }>(apiPath("/game/round/current"));
}

export function fetchRoundHistory(input: PaginationParams = {}) {
  return request<{ rounds: RoundHistoryDto[]; pageInfo: PageInfo }>(
    apiPath(`/game/rounds/history${paginationSuffix(input)}`),
  );
}

export function fetchMyBetHistory(accessToken: string, input: PaginationParams = {}) {
  return request<{ bets: UserBetHistoryDto[]; pageInfo: PageInfo }>(
    apiPath(`/game/bets/me${paginationSuffix(input)}`),
    {},
    accessToken,
  );
}

export function fetchLeaderboard() {
  return request<{ users: LeaderboardUserDto[] }>(apiPath("/users/leaderboard"));
}

export function placePrediction(
  accessToken: string,
  input: {
    roundId: string;
    choice: string;
    coinsStaked: number;
    idempotencyKey: string;
  },
) {
  return request<{ bet: BetDto; wallet?: WalletDto }>(apiPath("/game/bets"), {
    method: "POST",
    body: JSON.stringify({
      ...input,
      selection: input.choice,
      amount: input.coinsStaked,
    }),
  }, accessToken);
}

export function fetchAdminUsers(accessToken: string, query?: string) {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<{ users: AdminUserDto[] }>(apiPath(`/admin/users${params}`), {}, accessToken);
}

export function banAdminUser(accessToken: string, userId: string) {
  return request<{ user: AdminUserDto }>(apiPath(`/admin/users/${userId}/ban`), { method: "POST" }, accessToken);
}

export function unbanAdminUser(accessToken: string, userId: string) {
  return request<{ user: AdminUserDto }>(apiPath(`/admin/users/${userId}/unban`), { method: "POST" }, accessToken);
}

export function fetchAdminRounds(accessToken: string) {
  return request<{ rounds: AdminRoundDto[] }>(apiPath("/admin/rounds"), {}, accessToken);
}

export function fetchAdminActiveRound(accessToken: string) {
  return request<{ round: AdminRoundDto | null }>(apiPath("/admin/rounds/active"), {}, accessToken);
}

export function forceStartRound(accessToken: string, reason?: string) {
  return request<{ round: AdminRoundDto }>(apiPath("/admin/rounds/force-start"), {
    method: "POST",
    body: JSON.stringify({ reason }),
  }, accessToken);
}

export function forceStopRound(accessToken: string, reason: string) {
  return request<{ round: AdminRoundDto }>(apiPath("/admin/rounds/force-stop"), {
    method: "POST",
    body: JSON.stringify({ reason, confirmation: "STOP ROUND" }),
  }, accessToken);
}

export function fetchAdminWallet(accessToken: string, userId: string) {
  return request<{ wallet: WalletDto }>(apiPath(`/admin/wallet/${userId}`), {}, accessToken);
}

export function adjustAdminWallet(
  accessToken: string,
  userId: string,
  input: {
    amountCoins: number;
    direction: "CREDIT" | "DEBIT";
    reason: string;
    confirmation: "ADJUST WALLET";
  },
) {
  return request<{ wallet?: WalletDto; ledgerEntry: LedgerEntryDto }>(apiPath(`/admin/wallet/${userId}/adjust`), {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey: createAdminWalletAdjustmentIdempotencyKey(userId),
    }),
  }, accessToken);
}

export function createAdminWalletAdjustmentIdempotencyKey(userId: string) {
  return `admin-ui:${userId}:${crypto.randomUUID()}`;
}

export function fetchAdminLedger(accessToken: string, userId: string, input: PaginationParams = {}) {
  return request<{ entries: LedgerEntryDto[]; pageInfo: PageInfo }>(
    apiPath(`/admin/ledger/${userId}${paginationSuffix(input)}`),
    {},
    accessToken,
  );
}

export function fetchAdminBets(
  accessToken: string,
  filters: { roundId?: string; userId?: string } = {},
) {
  const params = new URLSearchParams();
  if (filters.roundId) {
    params.set("roundId", filters.roundId);
  }
  if (filters.userId) {
    params.set("userId", filters.userId);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<{ bets: AdminBetDto[]; suspiciousUsers: SuspiciousBettingPatternDto[] }>(
    apiPath(`/admin/bets${suffix}`),
    {},
    accessToken,
  );
}

export function fetchAdminSystemHealth(accessToken: string) {
  return request<AdminSystemHealthDto>(apiPath("/admin/system-health"), {}, accessToken);
}

export function fetchAdminAuditLogs(accessToken: string) {
  return request<{ auditLogs: AuditLogDto[] }>(apiPath("/admin/audit-logs"), {}, accessToken);
}

export function fetchAdminFraudLogs(accessToken: string) {
  return request<{ fraudLogs: FraudLogDto[] }>(apiPath("/admin/fraud/logs"), {}, accessToken);
}

export function fetchAdminRiskProfiles(accessToken: string) {
  return request<{ riskProfiles: RiskProfileDto[] }>(apiPath("/admin/fraud/risk-profiles"), {}, accessToken);
}

interface PaginationParams {
  limit?: number;
  cursor?: string | null;
}

interface PageInfo {
  limit: number;
  nextCursor: string | null;
}

function paginationSuffix(input: PaginationParams) {
  const params = new URLSearchParams();

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return params.size > 0 ? `?${params.toString()}` : "";
}
