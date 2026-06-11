import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { requiresRedisForFraudProtection } = await import("./rateLimiter.js");

test("fraud rate limiter requires Redis in staging and production", () => {
  assert.equal(requiresRedisForFraudProtection("production"), true);
  assert.equal(requiresRedisForFraudProtection("staging"), true);
  assert.equal(requiresRedisForFraudProtection("development"), false);
  assert.equal(requiresRedisForFraudProtection("test"), false);
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
