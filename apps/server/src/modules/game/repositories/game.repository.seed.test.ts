import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { GameRepository } = await import("./game.repository.js");
const { decryptRoundSeedReveal } = await import("../services/round-secret.crypto.js");

test("round creation stores seedHash and durable encrypted reveal in the same transaction client", async () => {
  const calls: string[] = [];
  let secretRecord: { roundId: string; seedRevealEncrypted: string } | null = null;
  const round = {
    id: "11111111-1111-4111-8111-111111111111",
    seedHash: "hash",
  };
  const tx = {
    gameRound: {
      create: async ({ data }: { data: { seedHash: string } }) => {
        calls.push(`round:${data.seedHash}`);
        return round;
      },
    },
    gameRoundSecret: {
      create: async ({ data }: { data: typeof secretRecord }) => {
        calls.push("secret");
        secretRecord = data;
        return data;
      },
    },
  };
  const repository = new GameRepository({} as never);

  await repository.createRound(tx as never, {
    roundNumber: 1n,
    startTime: new Date(),
    lockTime: new Date(),
    endTime: new Date(),
    seedHash: "hash",
    seedReveal: "durable-reveal",
  });

  assert.deepEqual(calls, ["round:hash", "secret"]);
  assert.equal(secretRecord?.roundId, round.id);
  assert.equal(decryptRoundSeedReveal(secretRecord!.seedRevealEncrypted), "durable-reveal");
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
  process.env.COOKIE_SECRET = "cookie-secret-for-tests-at-least-thirty-two-chars";
}
