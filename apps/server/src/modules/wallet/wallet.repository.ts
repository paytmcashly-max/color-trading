import {
  CoinLedgerDirection,
  CoinLedgerStatus,
  CoinLedgerType,
  LedgerReferenceType,
  type CoinLedger,
  type Prisma,
  type PrismaClient,
  type Wallet,
  WalletStatus,
} from "@prisma/client";

import type { PaginationInput } from "../../common/utils/pagination.js";

type TxClient = Prisma.TransactionClient;
const INITIAL_VIRTUAL_COINS = 1000n;

interface LockedWalletRow {
  id: string;
  userId: string;
  depositBalance: bigint;
  winningBalance: bigint;
  ledgerVersion: bigint;
  status: WalletStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface LedgerCreateInput {
  userId: string;
  walletId: string;
  type: CoinLedgerType;
  direction: CoinLedgerDirection;
  amountCoins: bigint;
  balanceBeforeCoins: bigint;
  balanceAfterCoins: bigint;
  idempotencyKey: string;
  referenceType: LedgerReferenceType;
  referenceId: string;
  status: CoinLedgerStatus;
  metadata?: Prisma.InputJsonValue;
}

export class WalletRepository {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<TResult>(handler: (tx: TxClient) => Promise<TResult>) {
    return this.prisma.$transaction(handler, {
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 10000,
    });
  }

  findWalletByUserId(userId: string) {
    return this.prisma.wallet.findUnique({
      where: { userId },
    });
  }

  async ensureWalletForUser(tx: TxClient, userId: string) {
    await tx.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        depositBalance: INITIAL_VIRTUAL_COINS,
        winningBalance: 0n,
        ledgerEntries: {
          create: {
            userId,
            type: CoinLedgerType.BONUS_CREDIT,
            direction: CoinLedgerDirection.CREDIT,
            amountCoins: INITIAL_VIRTUAL_COINS,
            balanceBeforeCoins: 0n,
            balanceAfterCoins: INITIAL_VIRTUAL_COINS,
            idempotencyKey: `user:${userId}:initial-virtual-coins`,
            referenceType: LedgerReferenceType.ADMIN_ACTION,
            referenceId: userId,
            status: CoinLedgerStatus.SUCCESS,
            metadata: {
              reason: "INITIAL_SIGNUP_BALANCE",
            },
          },
        },
      },
      select: { id: true },
    });

    const wallet = await this.lockWalletByUserId(tx, userId);

    if (!wallet) {
      throw new Error("Wallet could not be locked after creation.");
    }

    return wallet;
  }

  async lockWalletByUserId(tx: TxClient, userId: string) {
    const rows = await tx.$queryRaw<LockedWalletRow[]>`
      SELECT
        id,
        user_id AS "userId",
        deposit_balance AS "depositBalance",
        winning_balance AS "winningBalance",
        ledger_version AS "ledgerVersion",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM wallets
      WHERE user_id = CAST(${userId} AS uuid)
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  findLedgerByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.coinLedger.findUnique({
      where: { idempotencyKey },
    });
  }

  findLedgerByIdempotencyKeyInTx(tx: TxClient, idempotencyKey: string) {
    return tx.coinLedger.findUnique({
      where: { idempotencyKey },
    });
  }

  findLedgerByIdempotencyKeyForUser(userId: string, idempotencyKey: string) {
    return this.prisma.coinLedger.findFirst({
      where: {
        userId,
        idempotencyKey,
      },
    });
  }

  findLedgerByIdempotencyKeyForUserInTx(
    tx: TxClient,
    userId: string,
    idempotencyKey: string,
  ) {
    return tx.coinLedger.findFirst({
      where: {
        userId,
        idempotencyKey,
      },
    });
  }

  createLedgerEntry(tx: TxClient, input: LedgerCreateInput) {
    return tx.coinLedger.create({
      data: input,
    });
  }

  updateWalletSnapshot(
    tx: TxClient,
    walletId: string,
    balances: { depositBalance: bigint; winningBalance: bigint },
  ) {
    return tx.wallet.update({
      where: { id: walletId },
      data: {
        depositBalance: balances.depositBalance,
        winningBalance: balances.winningBalance,
        ledgerVersion: {
          increment: 1,
        },
      },
    });
  }

  getLedgerHistory(userId: string, pagination: PaginationInput = { limit: 50 }) {
    return this.prisma.coinLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });
  }

  getWalletTransactions(userId: string, pagination: PaginationInput = { limit: 50 }) {
    return this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });
  }

  getWalletBalanceFromLedger(userId: string) {
    return this.prisma.coinLedger.findMany({
      where: {
        userId,
        status: CoinLedgerStatus.SUCCESS,
      },
      select: {
        direction: true,
        amountCoins: true,
      },
    });
  }
}

export type LockedWallet = LockedWalletRow;
export type WalletRecord = Wallet;
export type LedgerRecord = CoinLedger;
