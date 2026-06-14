import assert from "node:assert/strict";
import test from "node:test";

import { PaymentIntentStatus } from "@prisma/client";

import { PaymentService, serializeIntent } from "./payment.service.js";

test("payment intent serialization converts paise to separate premium credits", () => {
  const result = serializeIntent({
    id: "11111111-1111-4111-8111-111111111111",
    amountPaise: 10_000n,
    status: PaymentIntentStatus.CREATED,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    creditedAt: null,
    updatedAt: new Date("2029-01-01T00:00:00.000Z"),
  });
  assert.equal(result.credits, "100");
  assert.equal("depositBalance" in result, false);
});

test("payment intent idempotency rejects a replay belonging to another user", async () => {
  const prisma = {
    paymentIntent: {
      findUnique: async () => ({
        id: "intent-1",
        userId: "user-1",
        amountPaise: 1_000n,
        purpose: "PREMIUM_CREDITS",
        status: PaymentIntentStatus.CREATED,
        expiresAt: new Date(Date.now() + 60_000),
        creditedAt: null,
        updatedAt: new Date(),
      }),
    },
  };
  const service = new PaymentService(prisma as never, {
    paymentAppUrl: "http://localhost:4100",
    intentSigningSecret: "intent-signing-secret-at-least-32-characters",
  });

  await assert.rejects(
    () => service.createIntent("user-2", {
      amountPaise: 1_000,
      purpose: "PREMIUM_CREDITS",
      idempotencyKey: "intent-key-123456",
    }),
    /Idempotency key was already used/,
  );
});

test("verified payment event credits premium ledger once and duplicate event is idempotent", async () => {
  let processed: { eventId: string; payloadHash: string } | null = null;
  let balance = 0n;
  let ledgerCreates = 0;
  const intent = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    amountPaise: 10_000n,
    purpose: "PREMIUM_CREDITS",
    status: PaymentIntentStatus.CREATED,
    providerTxnId: null,
    expiresAt: new Date("2030-01-01T00:10:00.000Z"),
  };
  const tx = {
    processedPaymentEvent: {
      findUnique: async () => processed,
      create: async ({ data }: { data: { eventId: string; payloadHash: string } }) => {
        processed = data;
        return data;
      },
    },
    paymentIntent: {
      findUnique: async () => intent,
      update: async () => intent,
    },
    premiumCreditWallet: {
      upsert: async () => ({}),
      update: async ({ data }: { data: { balanceCredits: bigint } }) => {
        balance = data.balanceCredits;
        return {};
      },
    },
    premiumCreditLedgerEntry: {
      create: async () => {
        ledgerCreates += 1;
        return {};
      },
    },
    $queryRaw: async () => [{ id: "33333333-3333-4333-8333-333333333333", balanceCredits: balance }],
  };
  const prisma = {
    $transaction: async (handler: (client: typeof tx) => Promise<unknown>) => handler(tx),
  };
  const service = new PaymentService(prisma as never, {});
  const event = {
    eventId: "44444444-4444-4444-8444-444444444444",
    intentId: intent.id,
    userId: intent.userId,
    amountPaise: "10000",
    purpose: "PREMIUM_CREDITS" as const,
    provider: "cashfree" as const,
    providerOrderId: "pc_order_1",
    providerTxnId: "cf_payment_1",
    status: "PAID_VERIFIED" as const,
    paidAt: "2030-01-01T00:00:00.000Z",
  };

  assert.deepEqual(await service.processVerifiedEvent(event, "hash-1"), { idempotent: false });
  assert.equal(balance, 100n);
  assert.equal(ledgerCreates, 1);
  assert.deepEqual(await service.processVerifiedEvent(event, "hash-1"), { idempotent: true });
  assert.equal(balance, 100n);
  assert.equal(ledgerCreates, 1);
  await assert.rejects(() => service.processVerifiedEvent(event, "altered-hash"), /replay did not match/);
});

test("verified real-money deposit event credits isolated wallet exactly once", async () => {
  let processed: { eventId: string; payloadHash: string } | null = null;
  let available = 0n;
  let ledgerCreates = 0;
  let depositUpserts = 0;
  const intent = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    amountPaise: 10_000n,
    purpose: "REAL_MONEY_GAME_DEPOSIT",
    status: PaymentIntentStatus.CREATED,
    providerTxnId: null,
    expiresAt: new Date("2030-01-01T00:10:00.000Z"),
  };
  const tx = {
    processedPaymentEvent: {
      findUnique: async () => processed,
      create: async ({ data }: { data: { eventId: string; payloadHash: string } }) => {
        processed = data;
        return data;
      },
    },
    paymentIntent: { findUnique: async () => intent, update: async () => intent },
    realMoneyGameWallet: {
      upsert: async () => ({}),
      update: async ({ data }: { data: { availablePaise: bigint } }) => {
        available = data.availablePaise;
        return {};
      },
    },
    realMoneyGameLedgerEntry: {
      create: async () => {
        ledgerCreates += 1;
        return {};
      },
    },
    realMoneyDeposit: {
      upsert: async () => {
        depositUpserts += 1;
        return {};
      },
    },
    $queryRaw: async () => [{
      id: "33333333-3333-4333-8333-333333333333",
      availablePaise: available,
      lockedPaise: 0n,
    }],
  };
  const prisma = { $transaction: async (handler: (client: typeof tx) => Promise<unknown>) => handler(tx) };
  const service = new PaymentService(prisma as never, {});
  const event = {
    eventId: "44444444-4444-4444-8444-444444444444",
    intentId: intent.id,
    userId: intent.userId,
    amountPaise: "10000",
    purpose: "REAL_MONEY_GAME_DEPOSIT" as const,
    provider: "cashfree" as const,
    providerOrderId: "rm_order_1",
    providerTxnId: "cf_payment_2",
    status: "PAID_VERIFIED" as const,
    paidAt: "2030-01-01T00:00:00.000Z",
  };

  assert.deepEqual(await service.processVerifiedEvent(event, "hash-rm"), { idempotent: false });
  assert.equal(available, 10_000n);
  assert.equal(ledgerCreates, 1);
  assert.equal(depositUpserts, 1);
  assert.deepEqual(await service.processVerifiedEvent(event, "hash-rm"), { idempotent: true });
  assert.equal(available, 10_000n);
  assert.equal(ledgerCreates, 1);
});
