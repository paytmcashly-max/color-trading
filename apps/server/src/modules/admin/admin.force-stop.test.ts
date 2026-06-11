import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { AdminService } = await import("./admin.service.js");
const { subscribeToRealtimeEvents } = await import("../../sockets/socket.events.js");

test("force-stop cancels and refunds pending bets without emitting completed", async () => {
  const calls: string[] = [];
  const emittedEvents: Array<{ name: string; payload: unknown }> = [];
  const activeRound = {
    id: "round-1",
    roundNumber: 42n,
    status: "OPEN",
    result: null,
    seedHash: "seed-hash",
    seedReveal: null,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    lockTime: new Date("2026-01-01T00:00:45.000Z"),
    endTime: new Date("2026-01-01T00:01:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    bets: [{
      id: "bet-1",
      userId: "user-1",
      coinsStaked: 75n,
    }],
  };
  const cancelledRound = { ...activeRound, status: "CANCELLED" };
  const tx = {
    gameRound: {
      findFirst: async () => activeRound,
      update: async () => {
        calls.push("round-cancelled");
        return cancelledRound;
      },
    },
    auditLog: {
      create: async ({ data }: { data: { actionType: string } }) => {
        calls.push(data.actionType);
        return { id: "audit-1" };
      },
    },
    bet: {
      updateMany: async ({ data }: { data: { status: string } }) => {
        calls.push(`bet-${data.status.toLowerCase()}`);
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (handler: (client: typeof tx) => Promise<unknown>) => {
      calls.push("transaction-start");
      const result = await handler(tx);
      calls.push("transaction-end");
      return result;
    },
  };
  const walletUpdates: string[] = [];
  const service = new AdminService(prisma as never, {
    refundCancelledBetInTransaction: async () => ({
      wallet: { id: "wallet-1", depositBalance: 100n, winningBalance: 0n },
      ledgerEntry: { id: "ledger-1" },
    }),
    publishWalletUpdate: (userId: string) => walletUpdates.push(userId),
  } as never);
  const unsubscribe = subscribeToRealtimeEvents((event) => {
    emittedEvents.push({ name: event.name, payload: event.payload });
  });

  try {
    const result = await service.forceStopRound("admin-1", {
      confirmation: "STOP ROUND",
      reason: "Emergency operational stop",
    });

    assert.equal(result.round.status, "CANCELLED");
    assert.deepEqual(walletUpdates, ["user-1"]);
    assert.equal(calls.includes("bet-cancelled"), true);
    assert.equal(calls.includes("BET_REFUND"), true);
    assert.equal(calls.includes("ROUND_FORCE_STOP"), true);
    assert.equal(emittedEvents.some((event) => event.name === "round:cancelled"), true);
    assert.equal(emittedEvents.some((event) => event.name === "round:update"), true);
    assert.equal(emittedEvents.some((event) => event.name === "round:state"), true);
    assert.equal(emittedEvents.some((event) => event.name === "round:completed"), false);

    const cancellation = emittedEvents.find((event) => event.name === "round:cancelled");
    assert.deepEqual(cancellation?.payload, {
      round: {
        id: "round-1",
        roundNumber: "42",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
        startTime: "2026-01-01T00:00:00.000Z",
        lockTime: "2026-01-01T00:00:45.000Z",
        endTime: "2026-01-01T00:01:00.000Z",
        status: "CANCELLED",
        dbStatus: "CANCELLED",
        phase: "RESULT_DECLARED",
        lifecycleStatus: "SETTLED",
        engineStatus: "SETTLED",
        result: null,
        seedHash: "seed-hash",
        seedReveal: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      remainingSeconds: 0,
      syncedAt: (cancellation?.payload as { syncedAt: string }).syncedAt,
      reason: "Emergency operational stop",
      refundedBetCount: 1,
      refundedCoins: 75,
    });
  } finally {
    unsubscribe();
  }
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
