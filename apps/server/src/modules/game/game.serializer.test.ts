import assert from "node:assert/strict";
import { test } from "node:test";
import { PredictionColor, RoundStatus, type GameRound } from "@prisma/client";

const { serializeRound } = await import("./game.serializer.js");

test("round serializer hides seedReveal before settlement", () => {
  const serialized = serializeRound(buildRound(RoundStatus.OPEN));

  assert.equal(serialized.seedReveal, null);
});

test("round serializer exposes seedReveal after completion", () => {
  const serialized = serializeRound(buildRound(RoundStatus.COMPLETED));

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
    result: status === RoundStatus.COMPLETED ? PredictionColor.RED : null,
    seedHash: "seed-hash",
    seedReveal: "secret-seed",
    createdAt: now,
    updatedAt: now,
  };
}
