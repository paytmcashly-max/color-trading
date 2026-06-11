export type WalletTransactionType = "DEPOSIT" | "BET" | "WIN" | "LOSS" | "ADMIN_ADJUSTMENT";

export type WalletStatus = "ACTIVE" | "FROZEN" | "CLOSED";

export interface WalletBalance {
  id: string;
  userId: string;
  depositBalance: string;
  winningBalance: string;
  totalBalance: string;
  availableBalance: string;
  ledgerVersion: string;
  status: WalletStatus;
  createdAt?: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: string;
}

export interface WalletUpdateEvent {
  userId: string;
  wallet: WalletBalance;
  ledgerEntry?: {
    id: string;
    type: string;
    direction: "DEBIT" | "CREDIT";
    amountCoins: string;
    balanceBeforeCoins: string | null;
    balanceAfterCoins: string | null;
    status: string;
    createdAt: string;
  };
}

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface WalletBalanceResponse {
  wallet: WalletBalance;
}

export interface WalletTransactionsResponse {
  transactions: WalletTransaction[];
  pageInfo: PageInfo;
}

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  walletId: string;
  type: string;
  direction: "DEBIT" | "CREDIT";
  amountCoins: string;
  balanceBeforeCoins: string | null;
  balanceAfterCoins: string | null;
  idempotencyKey: string;
  referenceType: string | null;
  referenceId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletLedgerResponse {
  entries: WalletLedgerEntry[];
  pageInfo: PageInfo;
}
