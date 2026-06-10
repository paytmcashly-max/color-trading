import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { isSensitiveRoute } = await import("./security.middleware.js");

test("sensitive route detection only matches route prefixes", () => {
  assert.equal(isSensitiveRoute("/api/v1/auth/login"), true);
  assert.equal(isSensitiveRoute("/api/v1/wallet/transactions"), true);
  assert.equal(isSensitiveRoute("/public/api/v1/auth/login"), false);
  assert.equal(isSensitiveRoute("/api/v1/public/authors"), false);
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
