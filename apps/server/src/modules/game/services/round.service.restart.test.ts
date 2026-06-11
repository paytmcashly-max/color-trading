import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

setRequiredEnv();

const { RoundService } = await import("./round.service.js");
const { ResultService } = await import("./result.service.js");

test("locked round settles after restart using durable DB seed reveal", async () => {
  const seedReveal = "restart-safe-seed";
  const seedHash = crypto.createHash("sha256").update(seedReveal).digest("hex");
  const now = new Date();
  const lockedRound = createRound("LOCKED", seedHash, now);
  const completedRound = { ...lockedRound, status: "COMPLETED", seedReveal };
  let settled = false;
  let durableReads = 0;
  const repository = {
    findCurrentRound: async () => lockedRound,
    getGameControl: async () => null,
    findDurableRoundSeedReveal: async () => {
      durableReads += 1;
      return seedReveal;
    },
    updateRoundStatus: async () => ({ count: 1 }),
    findRoundById: async () => completedRound,
    markRoundSeedRevealed: async () => ({ count: 1 }),
    findLatestRound: async () => completedRound,
    transaction: async (handler: (tx: object) => Promise<unknown>) => handler({}),
    findCurrentRoundInTx: async () => completedRound,
  };
  const settlement = {
    settleRound: async () => {
      settled = true;
      return {
        roundId: lockedRound.id,
        result: "RED",
        totalBets: 0,
        winningBets: 0,
        losingBets: 0,
        totalPayoutCoins: "0",
        pendingBets: 0,
        creditedUsers: 0,
      };
    },
  };
  const service = new RoundService(
    repository as never,
    new ResultService(),
    settlement as never,
  );

  await service.ensureLifecycle();

  assert.equal(durableReads, 1);
  assert.equal(settled, true);
});

function createRound(status: string, seedHash: string, now: Date) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    roundNumber: 1n,
    startTime: new Date(now.getTime() - 60_000),
    lockTime: new Date(now.getTime() - 15_000),
    endTime: new Date(now.getTime() - 1_000),
    status,
    result: null,
    seedHash,
    seedReveal: null,
    createdAt: now,
    updatedAt: now,
  };
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
