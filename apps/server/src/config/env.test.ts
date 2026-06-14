import assert from "node:assert/strict";
import { test } from "node:test";

setImportEnvironment();

const { parseServerEnv } = await import("./env.js");

test("production environment requires explicit HTTP and socket origins", () => {
  const result = parseServerEnv(productionEnvironment({
    ALLOWED_ORIGINS: undefined,
    SOCKET_ALLOWED_ORIGINS: undefined,
  }));

  assert.equal(result.success, false);
  assert.deepEqual(result.error?.flatten().fieldErrors.ALLOWED_ORIGINS, [
    "ALLOWED_ORIGINS must be explicitly configured in production.",
  ]);
  assert.deepEqual(result.error?.flatten().fieldErrors.SOCKET_ALLOWED_ORIGINS, [
    "SOCKET_ALLOWED_ORIGINS must be explicitly configured in production.",
  ]);
});

test("production environment rejects matching JWT access and refresh secrets", () => {
  const sharedSecret = "unique-test-secret-that-is-longer-than-thirty-two-chars";
  const result = parseServerEnv(productionEnvironment({
    JWT_ACCESS_SECRET: sharedSecret,
    JWT_REFRESH_SECRET: sharedSecret,
  }));

  assert.equal(result.success, false);
  assert.deepEqual(result.error?.flatten().fieldErrors.JWT_REFRESH_SECRET, [
    "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different in production.",
  ]);
});

test("production environment rejects a weak cookie secret", () => {
  const result = parseServerEnv(productionEnvironment({
    COOKIE_SECRET: "too-short",
  }));

  assert.equal(result.success, false);
  assert.ok(result.error?.flatten().fieldErrors.COOKIE_SECRET?.length);
});

test("development environment accepts documented local example values", () => {
  const result = parseServerEnv({
    NODE_ENV: "development",
    PORT: "4000",
    CLIENT_ORIGIN: "http://localhost:3000",
    ALLOWED_ORIGINS: "http://localhost:3000",
    SOCKET_ALLOWED_ORIGINS: "http://localhost:3000",
    API_PREFIX: "/api/v1",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/color_trading",
    REDIS_URL: "redis://localhost:6379",
    JWT_ACCESS_SECRET: "local-access-secret-change-before-shared-use-123",
    JWT_REFRESH_SECRET: "local-refresh-secret-change-before-shared-use-456",
    COOKIE_SECRET: "local-cookie-secret-change-before-shared-use-789",
    ROUND_SEED_ENCRYPTION_KEY: "local-round-seed-key-change-before-shared-use-abc",
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.API_PREFIX, "/api/v1");
  assert.equal(result.data?.PORT, 4000);
});

function productionEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PORT: "4000",
    CLIENT_ORIGIN: "https://app.example.com",
    ALLOWED_ORIGINS: "https://app.example.com",
    SOCKET_ALLOWED_ORIGINS: "https://app.example.com",
    API_PREFIX: "/api/v1",
    DATABASE_URL: "postgresql://user:password@db.example.com:5432/color_trading",
    REDIS_URL: "rediss://user:password@redis.example.com:6379",
    JWT_ACCESS_SECRET: "production-access-secret-unique-and-long-enough-123",
    JWT_REFRESH_SECRET: "production-refresh-secret-unique-and-long-enough-456",
    COOKIE_SECRET: "production-cookie-secret-unique-and-long-enough-789",
    ROUND_SEED_ENCRYPTION_KEY: "production-round-seed-secret-unique-and-long-abc",
    PAYMENT_APP_URL: "https://payments.example.com",
    PAYMENT_INTENT_SIGNING_SECRET: "production-payment-intent-secret-unique-long-123",
    PAYMENT_SERVICE_SECRET: "production-payment-service-secret-unique-long-456",
    ...overrides,
  };
}

function setImportEnvironment() {
  Object.assign(process.env, productionEnvironment({
    NODE_ENV: "test",
  }));
}
