import assert from "node:assert/strict";
import { test } from "node:test";

setRequiredEnv();

const { HttpError } = await import("../../common/errors/http-error.js");
const { AuthService } = await import("./services/auth.service.js");

test("concurrent same-email registration creates one user wallet and initial ledger", async () => {
  const state = {
    users: 0,
    wallets: 0,
    ledgerEntries: 0,
    sessions: 0,
  };
  let prechecks = 0;
  let releasePrechecks!: () => void;
  const bothPrechecksReached = new Promise<void>((resolve) => {
    releasePrechecks = resolve;
  });
  const repository = {
    findUserIdByEmail: async () => {
      prechecks += 1;
      if (prechecks === 2) {
        releasePrechecks();
      }
      await bothPrechecksReached;
      return null;
    },
    createUserWithInitialWallet: async () => {
      if (state.users > 0) {
        throw prismaUniqueEmailError();
      }

      state.users += 1;
      state.wallets += 1;
      state.ledgerEntries += 1;
      return safeUser();
    },
    createSession: async () => {
      state.sessions += 1;
    },
  };
  const service = new AuthService(repository as never);
  const request = {
    email: "same@example.com",
    password: "StrongPass1!",
    displayName: "Same User",
  };

  const results = await Promise.allSettled([
    service.register(request, {}),
    service.register(request, {}),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const failures = results.filter((result) => result.status === "rejected");

  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.deepEqual(state, {
    users: 1,
    wallets: 1,
    ledgerEntries: 1,
    sessions: 1,
  });

  const failure = failures[0];
  assert.equal(failure?.status, "rejected");
  if (failure?.status === "rejected") {
    assert.equal(failure.reason instanceof HttpError, true);
    assert.equal(failure.reason.statusCode, 409);
    assert.equal(failure.reason.code, "REGISTRATION_UNAVAILABLE");
    assert.equal(
      failure.reason.message,
      "Unable to create an account with the provided details.",
    );
    assert.equal(JSON.stringify(failure.reason).includes("EMAIL_ALREADY_REGISTERED"), false);
    assert.equal(JSON.stringify(failure.reason).includes("same@example.com"), false);
  }
});

function prismaUniqueEmailError() {
  return {
    code: "P2002",
    meta: {
      modelName: "User",
      target: ["email"],
    },
  };
}

function safeUser() {
  const now = new Date();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "same@example.com",
    displayName: "Same User",
    status: "ACTIVE",
    role: "USER",
    emailVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
