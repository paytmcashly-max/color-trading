import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { errorHandler } = await import("./error-handler.js");
const { HttpError } = await import("../errors/http-error.js");

test("registration conflict public response is generic and consistent", () => {
  const captured = captureResponse();

  errorHandler(
    new HttpError(
      409,
      "REGISTRATION_UNAVAILABLE",
      "Unable to create an account with the provided details.",
    ),
    {} as never,
    captured.response as never,
    (() => undefined) as never,
  );

  assert.equal(captured.statusCode(), 409);
  assert.deepEqual(captured.body(), {
    success: false,
    message: "Unable to create an account with the provided details.",
    data: {
      code: "REGISTRATION_UNAVAILABLE",
    },
  });
  assert.equal(JSON.stringify(captured.body()).includes("EMAIL_ALREADY_REGISTERED"), false);
});

test("error handler returns a safe response for uncaught Prisma unique conflicts", () => {
  const captured = captureResponse();
  const rawError = {
    code: "P2002",
    message: "Unique constraint failed on users.email for secret@example.com",
    meta: { target: ["email"] },
  };

  errorHandler(rawError, {} as never, captured.response as never, (() => undefined) as never);

  assert.equal(captured.statusCode(), 409);
  assert.deepEqual(captured.body(), {
    success: false,
    message: "Unable to complete the request with the provided details.",
    data: {
      code: "CONFLICT",
    },
  });
  assert.equal(JSON.stringify(captured.body()).includes("secret@example.com"), false);
  assert.equal(JSON.stringify(captured.body()).includes("P2002"), false);
});

function captureResponse() {
  let statusCode = 0;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };

  return {
    response,
    statusCode: () => statusCode,
    body: () => body,
  };
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
