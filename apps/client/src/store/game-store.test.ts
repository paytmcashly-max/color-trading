import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { RoundDto } from "../types/api";
import { useGameStore } from "./game-store";

afterEach(() => {
  useGameStore.setState({
    currentRound: null,
    recentResults: [],
    lastResult: null,
    lastCancellation: null,
    timerRemainingSeconds: 0,
  });
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
