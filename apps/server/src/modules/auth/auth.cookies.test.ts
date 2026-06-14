import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { REFRESH_TOKEN_COOKIE_NAME, readRefreshTokenCookie, stripRefreshToken } = await import("./auth.cookies.js");

test("stripRefreshToken removes refresh tokens from public auth payloads", () => {
  const publicTokens = stripRefreshToken({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    expiresInSeconds: 900,
  });

  assert.deepEqual(publicTokens, {
    accessToken: "access-token",
    tokenType: "Bearer",
    expiresInSeconds: 900,
  });
  assert.equal("refreshToken" in publicTokens, false);
});

test("refresh cookie uses a secure-prefixed name in production", () => {
  assert.equal(REFRESH_TOKEN_COOKIE_NAME, "__Secure-color_trading_refresh");
});

test("readRefreshTokenCookie extracts the refresh cookie value", () => {
  const token = "refresh-token-value";
  const req = {
    headers: {
      cookie: `other=value; ${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    },
  };

  assert.equal(readRefreshTokenCookie(req as never), token);
});

function setRequiredEnv() {
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/color_trading";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.CLIENT_ORIGIN = "https://client.example.com";
  process.env.ALLOWED_ORIGINS = "https://client.example.com";
  process.env.SOCKET_ALLOWED_ORIGINS = "https://client.example.com";
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
  process.env.COOKIE_SECRET = "cookie-secret-for-tests-at-least-thirty-two-chars";
  process.env.ROUND_SEED_ENCRYPTION_KEY = "round-seed-key-for-tests-at-least-thirty-two-chars";
  process.env.PAYMENT_APP_URL = "https://payments.example.com";
  process.env.PAYMENT_INTENT_SIGNING_SECRET = "payment-intent-secret-for-tests-at-least-thirty-two-chars";
  process.env.PAYMENT_SERVICE_SECRET = "payment-service-secret-for-tests-at-least-thirty-two-chars";
}
