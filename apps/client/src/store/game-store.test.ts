import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { BetDto, RoundDto } from "../types/api";
import { useGameStore } from "./game-store";

afterEach(() => {
  useGameStore.setState({
    socketConnected: false,
    currentRound: null,
    recentResults: [],
    lastResult: null,
    lastCancellation: null,
    timerRemainingSeconds: 0,
    activeBets: [],
    settlementNotice: null,
    shownSettlementIds: [],
    gamePaused: false,
    gamePauseReason: null,
  });
});

test("pending order remains pending without a settlement notice", () => {
  const bet = buildBet("PENDING", null);
  useGameStore.getState().applyRealtimeEvent("bet:placed", { bet });

  assert.equal(useGameStore.getState().activeBets[0]?.status, "PENDING");
  assert.equal(useGameStore.getState().settlementNotice, null);
});

test("settled bet updates order and duplicate event does not show twice", () => {
  const bet = buildBet("WON", "100");
  useGameStore.getState().applyRealtimeEvent("bet:settled", bet);

  assert.equal(useGameStore.getState().settlementNotice?.status, "WON");
  assert.equal(useGameStore.getState().activeBets[0]?.netProfitLoss, "100");

  useGameStore.getState().dismissSettlementNotice();
  useGameStore.getState().applyRealtimeEvent("bet:settled", bet);
  assert.equal(useGameStore.getState().settlementNotice, null);
});

test("pre-marked settlement still updates order without replaying popup", () => {
  const bet = buildBet("LOST", "-100");
  useGameStore.getState().markSettlementShown(bet.id);
  useGameStore.getState().applyRealtimeEvent("bet:settled", bet);

  assert.equal(useGameStore.getState().activeBets[0]?.status, "LOST");
  assert.equal(useGameStore.getState().settlementNotice, null);
});

test("round cancellation clears stale result state without adding a winner result", () => {
  const completed = buildRound("COMPLETED", "RED");
  useGameStore.getState().applyRealtimeEvent("round:result", { round: completed });

  const cancelled = buildRound("CANCELLED", null);
  useGameStore.getState().applyRealtimeEvent("round:cancelled", {
    round: cancelled,
    reason: "Emergency operational stop",
    refundedBetCount: 1,
    refundedCoins: 50,
  });

  const state = useGameStore.getState();
  assert.equal(state.currentRound?.dbStatus, "CANCELLED");
  assert.equal(state.lastResult, null);
  assert.equal(state.recentResults.length, 1);
  assert.deepEqual(state.lastCancellation, {
    roundId: cancelled.id,
    reason: "Emergency operational stop",
  });
});

test("game pause and resume realtime events update betting state", () => {
  useGameStore.getState().applyRealtimeEvent("game:paused", {
    gameControl: { paused: true, reason: "Maintenance" },
  });

  assert.equal(useGameStore.getState().gamePaused, true);
  assert.equal(useGameStore.getState().gamePauseReason, "Maintenance");

  useGameStore.getState().applyRealtimeEvent("game:resumed", {
    gameControl: { paused: false },
  });
  assert.equal(useGameStore.getState().gamePaused, false);
  assert.equal(useGameStore.getState().gamePauseReason, null);
});

test("reconnect snapshot restores current game pause state", () => {
  useGameStore.getState().applyRealtimeEvent("system:sync", {
    gameControl: { paused: true, reason: "Settlement review" },
  });
  assert.equal(useGameStore.getState().gamePaused, true);

  useGameStore.getState().applyRealtimeEvent("system:sync", {
    gameControl: { paused: false, reason: null },
  });
  assert.equal(useGameStore.getState().gamePaused, false);
});

function buildRound(status: "COMPLETED" | "CANCELLED", result: "RED" | null): RoundDto {
  return {
    id: status.toLowerCase(),
    roundNumber: status === "COMPLETED" ? "1" : "2",
    startTime: "2026-01-01T00:00:00.000Z",
    lockTime: "2026-01-01T00:00:45.000Z",
    endTime: "2026-01-01T00:01:00.000Z",
    status: "RESULT_DECLARED",
    dbStatus: status,
    phase: "RESULT_DECLARED",
    result,
    seedHash: "hash",
    seedReveal: status === "COMPLETED" ? "reveal" : null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
  };
}

function buildBet(status: BetDto["status"], netProfitLoss: string | null): BetDto {
  return {
    id: "bet-1",
    userId: "user-1",
    roundId: "round-1",
    choice: "GREEN",
    coinsStaked: "100",
    status,
    payoutAmount: status === "WON" ? "200" : "0",
    netProfitLoss,
    settledAt: status === "PENDING" ? null : "2026-01-01T00:01:00.000Z",
    result: status === "PENDING" ? null : "GREEN",
    createdAt: "2026-01-01T00:00:10.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
  };
}
