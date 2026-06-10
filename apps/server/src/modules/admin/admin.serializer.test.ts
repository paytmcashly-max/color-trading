import assert from "node:assert/strict";
import { test } from "node:test";
import { PredictionColor, RoundStatus, type GameRound } from "@prisma/client";

const { serializeAdminRound } = await import("./admin.serializer.js");

test("admin round serializer hides seedReveal before terminal status", () => {
  const serialized = serializeAdminRound({ ...buildRound(RoundStatus.LOCKED), _count: { bets: 0 } });

  assert.equal(serialized.seedReveal, null);
});

test("admin round serializer exposes seedReveal after cancellation", () => {
  const serialized = serializeAdminRound({ ...buildRound(RoundStatus.CANCELLED), _count: { bets: 0 } });

  assert.equal(serialized.seedReveal, "secret-seed");
});

function buildRound(status: RoundStatus): GameRound {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "11111111-1111-4111-8111-111111111111",
    roundNumber: 1n,
    startTime: now,
    lockTime: now,
    endTime: now,
    status,
    result: status === RoundStatus.CANCELLED ? PredictionColor.RED : null,
    seedHash: "seed-hash",
    seedReveal: "secret-seed",
    createdAt: now,
    updatedAt: now,
  };
}
