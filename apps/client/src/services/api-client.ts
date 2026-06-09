import type {
  AdminBetDto,
  AdminRoundDto,
  AdminSystemHealthDto,
  AdminUserDto,
  AuditLogDto,
  AuthResponse,
  BetDto,
  LedgerEntryDto,
  RoundDto,
  FraudLogDto,
  RiskProfileDto,
  SuspiciousBettingPatternDto,
  WalletDto,
} from "@/types/api";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ApiErrorBody {
  success?: boolean;
  message?: string;
  data?: {
    code?: string;
    message?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

async function request<TResponse>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(
      body?.error?.message ??
        body?.data?.message ??
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

export function fetchHealth() {
  return request<unknown>("/health");
}

export function login(email: string, password: string) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string, displayName?: string) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function fetchMe(accessToken: string) {
  return request<{ user: AuthResponse["user"] }>("/auth/me", {}, accessToken);
}

export function logout(accessToken: string) {
  return request<{ success: true }>("/auth/logout", { method: "POST" }, accessToken);
}

export function fetchWallet(accessToken: string) {
  return request<{ wallet: WalletDto }>("/wallet/balance", {}, accessToken);
}

export function fetchLedger(accessToken: string) {
  return request<{ entries: LedgerEntryDto[] }>("/wallet/ledger", {}, accessToken);
}

export function fetchCurrentRound() {
  return request<{ round: RoundDto | null }>("/game/round/current");
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
  return request<{ bet: BetDto; wallet?: WalletDto }>("/game/bets", {
    method: "POST",
    body: JSON.stringify(input),
  }, accessToken);
}

export function fetchAdminUsers(accessToken: string, query?: string) {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<{ users: AdminUserDto[] }>(`/admin/users${params}`, {}, accessToken);
}

export function banAdminUser(accessToken: string, userId: string) {
  return request<{ user: AdminUserDto }>(`/admin/users/${userId}/ban`, { method: "POST" }, accessToken);
}

export function unbanAdminUser(accessToken: string, userId: string) {
  return request<{ user: AdminUserDto }>(`/admin/users/${userId}/unban`, { method: "POST" }, accessToken);
}

export function fetchAdminRounds(accessToken: string) {
  return request<{ rounds: AdminRoundDto[] }>("/admin/rounds", {}, accessToken);
}

export function fetchAdminActiveRound(accessToken: string) {
  return request<{ round: AdminRoundDto | null }>("/admin/rounds/active", {}, accessToken);
}

export function forceStartRound(accessToken: string, reason?: string) {
  return request<{ round: AdminRoundDto }>("/admin/rounds/force-start", {
    method: "POST",
    body: JSON.stringify({ reason }),
  }, accessToken);
}

export function forceStopRound(accessToken: string, reason: string) {
  return request<{ round: AdminRoundDto }>("/admin/rounds/force-stop", {
    method: "POST",
    body: JSON.stringify({ reason, confirmation: "STOP ROUND" }),
  }, accessToken);
}

export function fetchAdminWallet(accessToken: string, userId: string) {
  return request<{ wallet: WalletDto }>(`/admin/wallet/${userId}`, {}, accessToken);
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
  return request<{ wallet?: WalletDto; ledgerEntry: LedgerEntryDto }>(`/admin/wallet/${userId}/adjust`, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey: `admin-ui:${userId}:${Date.now()}`,
    }),
  }, accessToken);
}

export function fetchAdminLedger(accessToken: string, userId: string) {
  return request<{ entries: LedgerEntryDto[] }>(`/admin/ledger/${userId}`, {}, accessToken);
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
    `/admin/bets${suffix}`,
    {},
    accessToken,
  );
}

export function fetchAdminSystemHealth(accessToken: string) {
  return request<AdminSystemHealthDto>("/admin/system-health", {}, accessToken);
}

export function fetchAdminAuditLogs(accessToken: string) {
  return request<{ auditLogs: AuditLogDto[] }>("/admin/audit-logs", {}, accessToken);
}

export function fetchAdminFraudLogs(accessToken: string) {
  return request<{ fraudLogs: FraudLogDto[] }>("/admin/fraud/logs", {}, accessToken);
}

export function fetchAdminRiskProfiles(accessToken: string) {
  return request<{ riskProfiles: RiskProfileDto[] }>("/admin/fraud/risk-profiles", {}, accessToken);
}
