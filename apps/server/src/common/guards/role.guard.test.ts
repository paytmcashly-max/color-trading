import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRole } from "@prisma/client";

setRequiredEnv();

const { HttpError } = await import("../errors/http-error.js");
const { roleGuard } = await import("./role.guard.js");

test("USER role cannot access ADMIN routes", () => {
  const guard = roleGuard(UserRole.ADMIN);
  const req = {
    auth: {
      userId: "user-1",
      email: "user@example.com",
      role: UserRole.USER,
      sessionId: "session-1",
    },
  };

  assert.throws(
    () => guard(req as never, {} as never, () => undefined),
    (error: unknown) => error instanceof HttpError && error.code === "FORBIDDEN",
  );
});

test("ADMIN role can access ADMIN routes", () => {
  const guard = roleGuard(UserRole.ADMIN);
  let nextCalled = false;
  const req = {
    auth: {
      userId: "admin-1",
      email: "admin@example.com",
      role: UserRole.ADMIN,
      sessionId: "session-1",
    },
  };

  guard(req as never, {} as never, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
