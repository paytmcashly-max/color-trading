import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { logger, setLogSink } = await import("./logger.js");

test("logger redacts nested secrets before log sink persistence", () => {
  let captured: Record<string, unknown> | null = null;

  setLogSink((entry) => {
    captured = entry.metadata;
  });

  logger.info("redaction_test", {
    payload: {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      seedReveal: "seed-reveal",
      idempotencyKey: "idempotency-key",
      safe: "visible",
    },
  });

  setLogSink(null);

  assert.deepEqual(captured, {
    payload: {
      accessToken: "[REDACTED]",
      refreshToken: "[REDACTED]",
      seedReveal: "[REDACTED]",
      idempotencyKey: "[REDACTED]",
      safe: "visible",
    },
  });
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
