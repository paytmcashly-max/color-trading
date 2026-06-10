import type { CoinLedger, Wallet } from "@prisma/client";

export function serializeWallet(
  wallet: Pick<
    Wallet,
    | "id"
    | "userId"
    | "depositBalance"
    | "winningBalance"
    | "ledgerVersion"
    | "status"
    | "createdAt"
    | "updatedAt"
  >,
) {
  const totalBalance = wallet.depositBalance + wallet.winningBalance;

  return {
    id: wallet.id,
    userId: wallet.userId,
    depositBalance: wallet.depositBalance.toString(),
    winningBalance: wallet.winningBalance.toString(),
    totalBalance: totalBalance.toString(),
    availableBalance: totalBalance.toString(),
    ledgerVersion: wallet.ledgerVersion.toString(),
    status: wallet.status,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export function serializeLedgerEntry(
  entry: Pick<
    CoinLedger,
    | "id"
    | "userId"
    | "walletId"
    | "type"
    | "direction"
    | "amountCoins"
    | "balanceBeforeCoins"
    | "balanceAfterCoins"
    | "idempotencyKey"
    | "referenceType"
    | "referenceId"
    | "status"
    | "createdAt"
    | "updatedAt"
  >,
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
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function serializeWalletTransaction(
  entry: Pick<
    CoinLedger,
    | "id"
    | "userId"
    | "type"
    | "direction"
    | "amountCoins"
    | "balanceBeforeCoins"
    | "balanceAfterCoins"
    | "createdAt"
  >,
) {
  const balanceBefore = entry.balanceBeforeCoins ?? deriveBalanceBefore(entry);
  const balanceAfter = entry.balanceAfterCoins ?? balanceBefore;

  return {
    id: entry.id,
    userId: entry.userId,
    type: mapWalletTransactionType(entry.type),
    amount: entry.amountCoins.toString(),
    balanceBefore: balanceBefore.toString(),
    balanceAfter: balanceAfter.toString(),
    createdAt: entry.createdAt.toISOString(),
  };
}

export function serializeWalletTransactionView(
  entry: {
    id: string;
    userId: string;
    type: string;
    amount: bigint;
    balanceBefore: bigint | null;
    balanceAfter: bigint | null;
    createdAt: Date;
  },
) {
  return {
    id: entry.id,
    userId: entry.userId,
    type: entry.type,
    amount: entry.amount.toString(),
    balanceBefore: entry.balanceBefore?.toString() ?? "0",
    balanceAfter: entry.balanceAfter?.toString() ?? "0",
    createdAt: entry.createdAt.toISOString(),
  };
}

function deriveBalanceBefore(
  entry: Pick<CoinLedger, "direction" | "amountCoins" | "balanceAfterCoins">,
) {
  const balanceAfter = entry.balanceAfterCoins ?? 0n;

  return entry.direction === "CREDIT"
    ? balanceAfter - entry.amountCoins
    : balanceAfter + entry.amountCoins;
}

function mapWalletTransactionType(type: CoinLedger["type"]) {
  if (type === "BET_DEBIT") {
    return "BET";
  }

  if (type === "BET_WIN_CREDIT") {
    return "WIN";
  }

  if (type === "ADMIN_ADJUSTMENT") {
    return "ADMIN_ADJUSTMENT";
  }

  return "DEPOSIT";
}
