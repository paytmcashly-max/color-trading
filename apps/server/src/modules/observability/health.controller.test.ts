import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { evaluateReadiness } = await import("./health.controller.js");

test("readiness fails when database, Redis, or migrations are unavailable", () => {
  for (const input of [
    { dbHealthy: false, redisHealthy: true, migrationsReady: true },
    { dbHealthy: true, redisHealthy: false, migrationsReady: true },
    { dbHealthy: true, redisHealthy: true, migrationsReady: false },
  ]) {
    assert.equal(evaluateReadiness({ ...input, gameEngineEnabled: true }).ready, false);
  }
});

test("disabled game engine is reported safely without blocking healthy dependencies", () => {
  const result = evaluateReadiness({
    dbHealthy: true,
    redisHealthy: true,
    migrationsReady: true,
    gameEngineEnabled: false,
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.gameEngine, {
    enabled: false,
    dependenciesReady: true,
    status: "disabled",
  });
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
