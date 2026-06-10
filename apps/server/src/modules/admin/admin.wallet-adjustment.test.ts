import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { AdminService } = await import("./admin.service.js");

test("admin wallet adjustment and audit share one transaction and replay creates no audit", async () => {
  let transactionCount = 0;
  let auditCount = 0;
  let replay = false;
  const tx = {
    auditLog: {
      create: async () => {
        auditCount += 1;
        return { id: "audit-1" };
      },
    },
  };
  const prisma = {
    $transaction: async (handler: (client: typeof tx) => Promise<unknown>) => {
      transactionCount += 1;
      return handler(tx);
    },
  };
  const walletService = {
    adminAdjustCoinsInTransaction: async (client: unknown) => {
      assert.equal(client, tx);
      if (replay) {
        return { idempotentReplay: true, ledgerEntry: { id: "ledger-1" } };
      }
      replay = true;
      return {
        idempotentReplay: false,
        wallet: { id: "wallet-1" },
        ledgerEntry: { id: "ledger-1" },
      };
    },
    publishWalletUpdate: () => undefined,
  };
  const service = new AdminService(prisma as never, walletService as never);
  const dto = {
    amountCoins: 25,
    direction: "DEBIT" as const,
    reason: "Support correction",
    confirmation: "ADJUST WALLET" as const,
    idempotencyKey: "admin-adjustment:test:one",
  };

  await service.adjustWallet("admin-1", "user-1", dto);
  await service.adjustWallet("admin-1", "user-1", dto);

  assert.equal(transactionCount, 2);
  assert.equal(auditCount, 1);
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
