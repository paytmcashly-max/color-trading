import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

setRequiredEnv();

const { setLogSink } = await import("../../../common/utils/logger.js");
const {
  AuthRepository,
  fingerprintUserAgent,
  hasUserAgentMismatch,
} = await import("./auth.repository.js");

afterEach(() => {
  setLogSink(null);
});

test("user-agent change is a risk signal and not refresh replay proof", () => {
  assert.equal(hasUserAgentMismatch("Browser A", "Browser B"), true);
  assert.equal(hasUserAgentMismatch("Browser A", "Browser A"), false);
  assert.equal(hasUserAgentMismatch(null, "Browser B"), false);
});

test("valid refresh token with changed user-agent rotates and logs only safe fingerprints", async () => {
  const fixture = createRotationFixture({ storedUserAgent: "Browser A/1.0" });
  const logs: Array<{ message: string; metadata: Record<string, unknown> }> = [];
  setLogSink((entry) => logs.push({ message: entry.message, metadata: entry.metadata }));

  const result = await fixture.repository.rotateRefreshSession(
    rotationInput({ userAgent: "Browser B/2.0" }),
    new Date(),
  );

  assert.equal(result?.id, "user-1");
  assert.equal(fixture.allSessionRevocations(), 0);
  assert.equal(fixture.replacementSessions(), 1);

  const warning = logs.find((entry) => entry.message === "AUTH_REFRESH_USER_AGENT_CHANGED");
  assert.deepEqual(warning?.metadata, {
    userId: "user-1",
    sessionId: "session-1",
    previousUserAgentHash: fingerprintUserAgent("Browser A/1.0"),
    presentedUserAgentHash: fingerprintUserAgent("Browser B/2.0"),
    riskSignal: "USER_AGENT_CHANGED",
    riskPoints: 5,
    stepUpVerificationRecommended: false,
  });
  assert.equal(JSON.stringify(logs).includes("Browser A/1.0"), false);
  assert.equal(JSON.stringify(logs).includes("Browser B/2.0"), false);
  assert.equal(JSON.stringify(logs).includes("current-hash"), false);
  assert.equal(JSON.stringify(logs).includes("replacement-hash"), false);
  assert.equal(JSON.stringify(logs).includes("refresh-token"), false);
  assert.equal(JSON.stringify(logs).includes("cookie"), false);
});

test("reused revoked refresh token revokes all active sessions", async () => {
  const fixture = createRotationFixture({ revokedAt: new Date(Date.now() - 1000) });

  const result = await fixture.repository.rotateRefreshSession(rotationInput(), new Date());

  assert.equal(result, null);
  assert.equal(fixture.allSessionRevocations(), 1);
  assert.equal(fixture.replacementSessions(), 0);
});

test("refresh-token hash mismatch revokes all active sessions", async () => {
  const fixture = createRotationFixture({ refreshTokenHash: "different-hash" });

  const result = await fixture.repository.rotateRefreshSession(rotationInput(), new Date());

  assert.equal(result, null);
  assert.equal(fixture.allSessionRevocations(), 1);
  assert.equal(fixture.replacementSessions(), 0);
});

test("expired refresh session fails safely and revokes all active sessions", async () => {
  const fixture = createRotationFixture({ expiresAt: new Date(Date.now() - 1000) });

  const result = await fixture.repository.rotateRefreshSession(rotationInput(), new Date());

  assert.equal(result, null);
  assert.equal(fixture.allSessionRevocations(), 1);
  assert.equal(fixture.replacementSessions(), 0);
});

test("missing rotated session is treated as replay and revokes all active sessions", async () => {
  const fixture = createRotationFixture({ missing: true });

  const result = await fixture.repository.rotateRefreshSession(rotationInput(), new Date());

  assert.equal(result, null);
  assert.equal(fixture.allSessionRevocations(), 1);
  assert.equal(fixture.replacementSessions(), 0);
});

function createRotationFixture(overrides: {
  storedUserAgent?: string;
  refreshTokenHash?: string;
  revokedAt?: Date | null;
  expiresAt?: Date;
  missing?: boolean;
} = {}) {
  let allSessionRevocations = 0;
  let replacementSessions = 0;
  const user = {
    id: "user-1",
    email: "user@example.com",
    displayName: null,
    status: "ACTIVE",
    role: "USER",
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const tx = {
    authSession: {
      findFirst: async () =>
        overrides.missing
          ? null
          : {
              id: "session-1",
              refreshTokenHash: overrides.refreshTokenHash ?? "current-hash",
              userAgent: overrides.storedUserAgent ?? "Browser A",
              revokedAt: overrides.revokedAt ?? null,
              expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
              user,
            },
      updateMany: async ({ where }: { where: { id?: string } }) => {
        if (!where.id) {
          allSessionRevocations += 1;
        }
        return { count: 1 };
      },
      create: async () => {
        replacementSessions += 1;
        return {};
      },
    },
  };
  const repository = new AuthRepository({
    $transaction: async (handler: (client: typeof tx) => Promise<unknown>) => handler(tx),
  } as never);

  return {
    repository,
    allSessionRevocations: () => allSessionRevocations,
    replacementSessions: () => replacementSessions,
  };
}

function rotationInput({ userAgent = "Browser A" }: { userAgent?: string } = {}) {
  return {
    sessionId: "session-1",
    userId: "user-1",
    refreshTokenHash: "current-hash",
    now: new Date(),
    userAgent,
    replacementSession: {
      id: "session-2",
      userId: "user-1",
      refreshTokenHash: "replacement-hash",
      userAgent,
      expiresAt: new Date(Date.now() + 120_000),
    },
  };
}

function setRequiredEnv() {
  process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-at-least-thirty-two-chars";
  process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-at-least-thirty-two-chars";
}
