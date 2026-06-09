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

type TxClient = Prisma.TransactionClient;

interface LockedWalletRow {
  id: string;
  userId: string;
  balanceCoins: bigint;
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
      create: { userId },
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
        balance_coins AS "balanceCoins",
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

  findLedgerByIdempotencyKeyForUser(userId: string, idempotencyKey: string) {
    return this.prisma.coinLedger.findFirst({
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

  updateWalletSnapshot(tx: TxClient, walletId: string, balanceCoins: bigint) {
    return tx.wallet.update({
      where: { id: walletId },
      data: {
        balanceCoins,
        ledgerVersion: {
          increment: 1,
        },
      },
    });
  }

  getLedgerHistory(userId: string, limit = 50) {
    return this.prisma.coinLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
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
