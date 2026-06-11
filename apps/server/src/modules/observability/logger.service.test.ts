import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { LoggerService } = await import("./logger.service.js");
const { summarizeRealtimePayload } = await import("./observability.module.js");

test("database observability logs recursively redact sensitive metadata", async () => {
  let persisted: Array<{ metadata?: unknown }> = [];
  const service = new LoggerService({
    logEntry: {
      createMany: async ({ data }: { data: Array<{ metadata?: unknown }> }) => {
        persisted = data;
        return { count: data.length };
      },
    },
  } as never);

  service.enqueue({
    level: "info",
    message: "sensitive",
    metadata: {
      authorization: "Bearer secret",
      nested: {
        passwordHash: "hash",
        seedReveal: "seed",
        list: [{ ADMIN_BOOTSTRAP_TOKEN: "bootstrap", DATABASE_URL: "postgresql://secret" }],
      },
    },
  });
  await service.flush();

  assert.deepEqual(persisted[0]?.metadata, {
    authorization: "[REDACTED]",
    nested: {
      passwordHash: "[REDACTED]",
      seedReveal: "[REDACTED]",
      list: [{ ADMIN_BOOTSTRAP_TOKEN: "[REDACTED]", DATABASE_URL: "[REDACTED]" }],
    },
  });
});

test("realtime observability stores identifiers instead of full payload", () => {
  const summary = summarizeRealtimePayload({
    userId: "user-1",
    round: { id: "round-1", status: "OPEN", seedReveal: "secret" },
    wallet: { userId: "user-1", depositBalance: "1000" },
  });

  assert.deepEqual(summary, {
    userId: "user-1",
    roundId: "round-1",
    betId: undefined,
    code: undefined,
    status: "OPEN",
  });
  assert.equal(JSON.stringify(summary).includes("secret"), false);
  assert.equal(JSON.stringify(summary).includes("depositBalance"), false);
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
