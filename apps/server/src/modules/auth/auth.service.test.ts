import assert from "node:assert/strict";
import { test } from "node:test";

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

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
