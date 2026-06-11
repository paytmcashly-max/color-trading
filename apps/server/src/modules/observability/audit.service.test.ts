import assert from "node:assert/strict";
import { test } from "node:test";

const { AuditService } = await import("./audit.service.js");

test("audit service redacts sensitive metadata before persistence", async () => {
  let persisted: { metadata?: unknown } | null = null;
  const service = new AuditService({
    auditLog: {
      create: async ({ data }: { data: { metadata?: unknown } }) => {
        persisted = data;
        return { id: "audit-1" };
      },
    },
  } as never);

  await service.write({
    actorId: "admin-1",
    actorType: "ADMIN",
    action: "TEST",
    metadata: {
      targetId: "user-1",
      password: "Password1!",
      nested: {
        seedReveal: "seed",
        REDIS_URL: "redis://secret",
      },
    },
  });

  assert.deepEqual(persisted?.metadata, {
    targetId: "user-1",
    password: "[REDACTED]",
    nested: {
      seedReveal: "[REDACTED]",
      REDIS_URL: "[REDACTED]",
    },
  });
});
