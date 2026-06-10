import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { shouldStartGameEngine } = await import("./game.bootstrap.js");

test("GAME_ENGINE_ENABLED controls scheduler startup", () => {
  assert.equal(shouldStartGameEngine({ GAME_ENGINE_ENABLED: true }), true);
  assert.equal(shouldStartGameEngine({ GAME_ENGINE_ENABLED: false }), false);
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
