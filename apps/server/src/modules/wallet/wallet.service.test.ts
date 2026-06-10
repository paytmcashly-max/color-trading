import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CoinLedgerDirection,
  CoinLedgerStatus,
  CoinLedgerType,
  LedgerReferenceType,
  WalletStatus,
} from "@prisma/client";

setRequiredEnv();

const { HttpError } = await import("../../common/errors/http-error.js");
const { WalletService } = await import("./wallet.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const walletId = "22222222-2222-4222-8222-222222222222";
const referenceId = "33333333-3333-4333-8333-333333333333";

test("wallet idempotency returns a successful replay for the same transaction", async () => {
  const service = new WalletService(
    createReplayRepository({
      amountCoins: 50n,
      status: CoinLedgerStatus.SUCCESS,
    }),
  );

  const result = await service.debitCoins({
    userId,
    amountCoins: 50,
    referenceId,
    idempotencyKey: "bet:test:same-key",
  });

  assert.equal(result.idempotentReplay, true);
  assert.equal(result.ledgerEntry.idempotencyKey, "bet:test:same-key");
});

test("wallet idempotency rejects a replay with a different amount", async () => {
  const service = new WalletService(
    createReplayRepository({
      amountCoins: 50n,
      status: CoinLedgerStatus.SUCCESS,
    }),
  );

  await assert.rejects(
    () =>
      service.debitCoins({
        userId,
        amountCoins: 51,
        referenceId,
        idempotencyKey: "bet:test:same-key",
      }),
    (error: unknown) =>
      error instanceof HttpError && error.code === "IDEMPOTENCY_KEY_CONFLICT",
  );
});

test("admin debit consumes deposit balance before winning balance", async () => {
  let updatedBalances: { depositBalance: bigint; winningBalance: bigint } | undefined;
  const repository = {
    findLedgerByIdempotencyKey: async () => null,
    transaction: async (handler: (tx: unknown) => Promise<unknown>) => handler({}),
    ensureWalletForUser: async () => ({
      id: walletId,
      userId,
      depositBalance: 100n,
      winningBalance: 50n,
      ledgerVersion: 0n,
      status: WalletStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    createLedgerEntry: async (_tx: unknown, input: Record<string, unknown>) => ({
      id: "55555555-5555-4555-8555-555555555555",
      ...input,
      metadata: input.metadata ?? null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
    updateWalletSnapshot: async (
      _tx: unknown,
      _walletId: string,
      balances: { depositBalance: bigint; winningBalance: bigint },
    ) => {
      updatedBalances = balances;
      return {
        id: walletId,
        userId,
        ...balances,
        ledgerVersion: 1n,
        status: WalletStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  };
  const service = new WalletService(repository as never);

  await service.adminAdjustCoins({
    userId,
    amountCoins: 120,
    referenceId,
    idempotencyKey: "admin:test:deposit-first",
    direction: CoinLedgerDirection.DEBIT,
  });

  assert.deepEqual(updatedBalances, {
    depositBalance: 0n,
    winningBalance: 30n,
  });
});

function createReplayRepository(input: { amountCoins: bigint; status: CoinLedgerStatus }) {
  const ledger = {
    id: "44444444-4444-4444-8444-444444444444",
    userId,
    walletId,
    type: CoinLedgerType.BET_DEBIT,
    direction: CoinLedgerDirection.DEBIT,
    amountCoins: input.amountCoins,
    balanceBeforeCoins: 1000n,
    balanceAfterCoins: 1000n - input.amountCoins,
    idempotencyKey: "bet:test:same-key",
    referenceType: LedgerReferenceType.BET,
    referenceId,
    status: input.status,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  return {
    findLedgerByIdempotencyKey: async () => ledger,
  } as never;
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
