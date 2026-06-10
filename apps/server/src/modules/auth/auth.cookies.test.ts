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

test("refresh cookie uses a host-prefixed name in production", () => {
  assert.equal(REFRESH_TOKEN_COOKIE_NAME, "__Host-color_trading_refresh");
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
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
