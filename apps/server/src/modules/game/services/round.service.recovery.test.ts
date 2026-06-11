import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { RoundService } = await import("./round.service.js");
const { ResultService } = await import("./result.service.js");
const { subscribeToRealtimeEvents } = await import("../../../sockets/socket.events.js");

test("missing seed reveal cancels and recovers round instead of retrying forever", async () => {
  const now = new Date();
  const lockedRound = createRound("LOCKED", now);
  const cancelledRound = { ...lockedRound, status: "CANCELLED" };
  const nextRound = createRound("OPEN", now, "22222222-2222-4222-8222-222222222222");
  const events: string[] = [];
  let recoveries = 0;
  const repository = {
    findCurrentRound: async () => lockedRound,
    getGameControl: async () => null,
    findDurableRoundSeedReveal: async () => null,
    findRoundById: async () => cancelledRound,
    findLatestRound: async () => cancelledRound,
    transaction: async (handler: (tx: object) => Promise<unknown>) => handler({}),
    findCurrentRoundInTx: async () => nextRound,
  };
  const settlement = {
    recoverUnresolvableRound: async () => {
      recoveries += 1;
      return { recovered: true, refunds: [] };
    },
  };
  const unsubscribe = subscribeToRealtimeEvents((event) => events.push(event.name));

  try {
    const service = new RoundService(repository as never, new ResultService(), settlement as never);
    const result = await service.ensureLifecycle();

    assert.equal(result?.id, nextRound.id);
    assert.equal(recoveries, 1);
    assert.equal(events.includes("round:cancelled"), true);
    assert.equal(events.includes("round:update"), true);
  } finally {
    unsubscribe();
  }
});

function createRound(status: string, now: Date, id = "11111111-1111-4111-8111-111111111111") {
  return {
    id,
    roundNumber: 1n,
    startTime: new Date(now.getTime() - 60_000),
    lockTime: new Date(now.getTime() - 15_000),
    endTime: new Date(now.getTime() - 1_000),
    status,
    result: null,
    seedHash: "missing-seed-hash",
    seedReveal: null,
    createdAt: now,
    updatedAt: now,
  };
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
