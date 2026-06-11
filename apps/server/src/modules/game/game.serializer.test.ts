import assert from "node:assert/strict";
import { test } from "node:test";
import { BetStatus, PredictionColor, RoundStatus, type Bet, type GameRound } from "@prisma/client";

const { serializeBet, serializeRound, serializeUserBetHistory } = await import("./game.serializer.js");

test("round serializer hides seedReveal before settlement", () => {
  const serialized = serializeRound(buildRound(RoundStatus.OPEN));

  assert.equal(serialized.seedReveal, null);
});

test("round serializer exposes seedReveal after completion", () => {
  const serialized = serializeRound(buildRound(RoundStatus.COMPLETED));

  assert.equal(serialized.seedReveal, "secret-seed");
});

test("pending bet has no net profit or settlement time", () => {
  const serialized = serializeBet(buildBet(BetStatus.PENDING, 100n, 0n));

  assert.equal(serialized.netProfitLoss, null);
  assert.equal(serialized.settledAt, null);
});

test("won and lost bets expose final net profit or loss", () => {
  const won = serializeBet(buildBet(BetStatus.WON, 100n, 200n));
  const lost = serializeBet(buildBet(BetStatus.LOST, 100n, 0n));

  assert.equal(won.netProfitLoss, "100");
  assert.equal(won.payoutAmount, "200");
  assert.equal(lost.netProfitLoss, "-100");
});

test("cancelled history bet is neutral and includes round result fields", () => {
  const bet = buildBet(BetStatus.CANCELLED, 100n, 0n);
  const serialized = serializeUserBetHistory({
    ...bet,
    round: {
      roundNumber: 123n,
      status: RoundStatus.CANCELLED,
      result: null,
      startTime: bet.createdAt,
      endTime: bet.updatedAt,
    },
  });

  assert.equal(serialized.netProfitLoss, "0");
  assert.equal(serialized.result, null);
  assert.equal(serialized.roundNumber, "123");
  assert.equal(serialized.roundEndTime, bet.updatedAt.toISOString());
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

function buildBet(status: BetStatus, coinsStaked: bigint, payoutAmount: bigint): Bet {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    roundId: "11111111-1111-4111-8111-111111111111",
    choice: PredictionColor.RED,
    coinsStaked,
    idempotencyKey: "test-bet",
    status,
    payoutAmount,
    createdAt,
    updatedAt: new Date("2026-01-01T00:01:00.000Z"),
  };
}
