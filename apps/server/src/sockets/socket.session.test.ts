import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { HttpError } = await import("../common/errors/http-error.js");
const { assertSocketSessionActive, revalidateSocketSession } = await import("./socket.session.js");

const user = {
  userId: "user-1",
  email: "user@example.com",
  role: "USER",
  sessionId: "session-1",
};

test("socket session revalidation accepts an active session", async () => {
  await assertSocketSessionActive(createPrisma({ id: "session-1", user: { status: "ACTIVE" } }), user);
});

test("socket session revalidation rejects a revoked session", async () => {
  await assert.rejects(
    () => assertSocketSessionActive(createPrisma(null), user),
    (error: unknown) => error instanceof HttpError && error.code === "SESSION_REVOKED",
  );
});

test("socket session revalidation rejects an inactive user", async () => {
  await assert.rejects(
    () => assertSocketSessionActive(createPrisma({ id: "session-1", user: { status: "SUSPENDED" } }), user),
    (error: unknown) => error instanceof HttpError && error.code === "USER_NOT_ACTIVE",
  );
});

test("sensitive socket revalidation disconnects a revoked session", async () => {
  let disconnected = false;
  const active = await revalidateSocketSession(createPrisma(null), user, () => {
    disconnected = true;
  });

  assert.equal(active, false);
  assert.equal(disconnected, true);
});

function createPrisma(result: unknown) {
  return {
    authSession: {
      findFirst: async () => result,
    },
  } as never;
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
