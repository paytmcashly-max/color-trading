import assert from "node:assert/strict";
import { test } from "node:test";

const { redactSensitiveData } = await import("./redact.js");

test("recursive sanitizer redacts nested secrets and keeps safe identifiers", () => {
  const redacted = redactSensitiveData({
    userId: "user-1",
    nested: {
      authorization: "Bearer token",
      cookie: "session=value",
      password: "Password1!",
      passwordHash: "hash",
      DATABASE_URL: "postgresql://secret",
      REDIS_URL: "redis://secret",
      PAYMENT_DATABASE_URL: "postgresql://payment-secret",
      CASHFREE_CLIENT_ID: "cashfree-client",
      CASHFREE_CLIENT_SECRET: "cashfree-secret",
      list: [
        {
          seedReveal: "seed",
          refreshTokenHash: "hash",
          jwt: "jwt-secret",
          safeRoundId: "round-1",
        },
      ],
    },
  });

  assert.deepEqual(redacted, {
    userId: "user-1",
    nested: {
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      password: "[REDACTED]",
      passwordHash: "[REDACTED]",
      DATABASE_URL: "[REDACTED]",
      REDIS_URL: "[REDACTED]",
      PAYMENT_DATABASE_URL: "[REDACTED]",
      CASHFREE_CLIENT_ID: "[REDACTED]",
      CASHFREE_CLIENT_SECRET: "[REDACTED]",
      list: [
        {
          seedReveal: "[REDACTED]",
          refreshTokenHash: "[REDACTED]",
          jwt: "[REDACTED]",
          safeRoundId: "round-1",
        },
      ],
    },
  });
});
