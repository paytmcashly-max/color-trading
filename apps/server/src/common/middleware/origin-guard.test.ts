import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { HttpError } = await import("../errors/http-error.js");
const { assertTrustedOrigin } = await import("./origin-guard.js");

test("trusted origin guard accepts configured production origins", () => {
  assert.doesNotThrow(() =>
    assertTrustedOrigin({
      get: (header: string) => (header.toLowerCase() === "origin" ? "https://client.example.com" : undefined),
    } as never),
  );
});

test("trusted origin guard rejects cross-site origins", () => {
  assert.throws(
    () =>
      assertTrustedOrigin({
        get: (header: string) => (header.toLowerCase() === "origin" ? "https://evil.example.com" : undefined),
      } as never),
    (error: unknown) => error instanceof HttpError && error.code === "ORIGIN_NOT_ALLOWED",
  );
});

test("trusted origin guard requires origin in production", () => {
  assert.throws(
    () =>
      assertTrustedOrigin({
        get: () => undefined,
      } as never),
    (error: unknown) => error instanceof HttpError && error.code === "ORIGIN_REQUIRED",
  );
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
}
