import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { readRoundSeedReveal, storeRoundSeedReveal } = await import("./round-seed.service.js");

test("cache write failure does not prevent round seed use", async () => {
  const failingRedis = {
    set: async () => {
      throw new Error("redis unavailable");
    },
  };

  await assert.doesNotReject(() =>
    storeRoundSeedReveal("round-cache-failure", "durable-seed", failingRedis as never),
  );
  assert.equal(await readRoundSeedReveal("round-cache-failure", null), "durable-seed");
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
