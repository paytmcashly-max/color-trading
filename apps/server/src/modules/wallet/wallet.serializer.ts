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
    balanceAfterCoins: entry.balanceAfterCoins?.toString() ?? null,
    idempotencyKey: entry.idempotencyKey,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    status: entry.status,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
