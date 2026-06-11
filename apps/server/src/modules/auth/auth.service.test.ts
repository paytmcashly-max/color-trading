import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

setRequiredEnv();

const { HttpError } = await import("../../common/errors/http-error.js");
const { AuthService } = await import("./auth.service.js");

test("registration does not reveal whether an email already exists", async () => {
  const service = new AuthService({
    findUserIdByEmail: async () => ({ id: "existing-user" }),
  } as never);

  await assert.rejects(
    () => service.register(
      { email: "existing@example.com", password: "StrongPass1!" },
      {},
    ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "REGISTRATION_UNAVAILABLE" &&
      !error.message.toLowerCase().includes("registered") &&
      !error.message.toLowerCase().includes("exists"),
  );
});

test("expired signed refresh token fails with a safe generic error", async () => {
  let revokedUserId: string | null = null;
  const service = new AuthService({
    revokeAllSessions: async (userId: string) => {
      revokedUserId = userId;
      return 2;
    },
  } as never);
  const expiredToken = jwt.sign(
    {
      sub: "user-1",
      sessionId: "session-1",
      tokenType: "refresh",
    },
    process.env.JWT_REFRESH_SECRET!,
    {
      algorithm: "HS256",
      expiresIn: -1,
      issuer: "color-trading-api",
      audience: "color-trading-client",
    },
  );

  await assert.rejects(
    () => service.refresh({ refreshToken: expiredToken }, { userAgent: "Browser A" }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "INVALID_REFRESH_TOKEN" &&
      error.message === "Invalid or expired refresh token.",
  );
  assert.equal(revokedUserId, "user-1");
});

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
