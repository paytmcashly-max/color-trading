import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

setRequiredEnv();

const { decryptRoundSeedReveal, encryptRoundSeedReveal } = await import("./round-secret.crypto.js");
const { ResultService } = await import("./result.service.js");

test("durable seed reveal is encrypted and recoverable", () => {
  const seedReveal = "a".repeat(64);
  const encrypted = encryptRoundSeedReveal(seedReveal);

  assert.notEqual(encrypted, seedReveal);
  assert.equal(encrypted.includes(seedReveal), false);
  assert.equal(decryptRoundSeedReveal(encrypted), seedReveal);
});

test("seed hash matches the reveal used for deterministic result generation", () => {
  const service = new ResultService();
  const seed = service.createSeed();

  assert.equal(service.seedHashMatches(seed.seedReveal, seed.seedHash), true);
  assert.equal(service.seedHashMatches(`${seed.seedReveal}x`, seed.seedHash), false);
  assert.equal(
    seed.seedHash,
    crypto.createHash("sha256").update(seed.seedReveal).digest("hex"),
  );
  assert.equal(service.generateResult(seed.seedReveal), service.generateResult(seed.seedReveal));
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
  process.env.COOKIE_SECRET = "cookie-secret-for-tests-at-least-thirty-two-chars";
}
