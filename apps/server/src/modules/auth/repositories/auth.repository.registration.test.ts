import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { AuthRepository } = await import("./auth.repository.js");

test("user wallet and initial ledger commit together in one transaction", async () => {
  const committed = {
    users: 0,
    wallets: 0,
    ledgerEntries: 0,
  };
  const prisma = transactionalPrisma(committed);
  const repository = new AuthRepository(prisma as never);

  await repository.createUserWithInitialWallet({
    email: "atomic@example.com",
    passwordHash: "hash",
  });

  assert.deepEqual(committed, {
    users: 1,
    wallets: 1,
    ledgerEntries: 1,
  });
});

test("initial ledger failure rolls back user and wallet creation", async () => {
  const committed = {
    users: 0,
    wallets: 0,
    ledgerEntries: 0,
  };
  const prisma = transactionalPrisma(committed, { failLedger: true });
  const repository = new AuthRepository(prisma as never);

  await assert.rejects(() =>
    repository.createUserWithInitialWallet({
      email: "rollback@example.com",
      passwordHash: "hash",
    }),
  );

  assert.deepEqual(committed, {
    users: 0,
    wallets: 0,
    ledgerEntries: 0,
  });
});

function transactionalPrisma(
  committed: { users: number; wallets: number; ledgerEntries: number },
  options: { failLedger?: boolean } = {},
) {
  return {
    $transaction: async (handler: (tx: object) => Promise<unknown>) => {
      const staged = {
        users: 0,
        wallets: 0,
        ledgerEntries: 0,
      };
      const now = new Date();
      const tx = {
        user: {
          create: async () => {
            staged.users += 1;
            return {
              id: "11111111-1111-4111-8111-111111111111",
              email: "atomic@example.com",
              displayName: null,
              status: "ACTIVE",
              role: "USER",
              emailVerifiedAt: null,
              createdAt: now,
              updatedAt: now,
            };
          },
        },
        wallet: {
          create: async () => {
            staged.wallets += 1;
            return { id: "22222222-2222-4222-8222-222222222222" };
          },
        },
        coinLedger: {
          create: async () => {
            if (options.failLedger) {
              throw new Error("ledger unavailable");
            }
            staged.ledgerEntries += 1;
            return { id: "33333333-3333-4333-8333-333333333333" };
          },
        },
      };

      const result = await handler(tx);
      committed.users += staged.users;
      committed.wallets += staged.wallets;
      committed.ledgerEntries += staged.ledgerEntries;
      return result;
    },
  };
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
