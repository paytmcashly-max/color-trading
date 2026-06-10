import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { walletRouter } = await import("./wallet.routes.js");

test("wallet router exposes no direct mutation routes", () => {
  const paths = walletRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route.methods).join(",")}:${layer.route.path}`);

  assert.equal(paths.some((path) => path.includes("bonus-credit")), false);
  assert.equal(paths.some((path) => path.includes("bet-debit")), false);
  assert.equal(paths.every((path) => path.startsWith("get:")), true);
});

function setRequiredEnv() {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/color_trading";
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
