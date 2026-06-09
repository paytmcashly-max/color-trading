import type { CoinLedger, Wallet } from "@prisma/client";

export function serializeWallet(wallet: Pick<Wallet, "id" | "userId" | "balanceCoins" | "ledgerVersion" | "status" | "createdAt" | "updatedAt">) {
  return {
    id: wallet.id,
    userId: wallet.userId,
    balanceCoins: wallet.balanceCoins.toString(),
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
