import assert from "node:assert/strict";
import { test } from "node:test";

import {
  betStatusLabel,
  errorToPlayerMessage,
  playerConnectionCopy,
  resultPopupCopy,
  roundStatusLabel,
  walletActivityLabel,
} from "./player-copy";

test("player status labels never expose backend enums", () => {
  assert.equal(betStatusLabel("PENDING"), "Waiting for result");
  assert.equal(betStatusLabel("WON"), "Won");
  assert.equal(betStatusLabel("LOST"), "Lost");
  assert.equal(roundStatusLabel("RESOLVING"), "Result is coming");
  assert.notEqual(roundStatusLabel("RESOLVING"), "RESOLVING");
  assert.equal(roundStatusLabel("UNKNOWN_STATUS"), "Updating...");
});

test("wallet bet activity uses player-friendly copy", () => {
  const copy = walletActivityLabel("BET_LOCKED");
  assert.equal(copy.title, "Bet amount locked");
  assert.equal(`${copy.title} ${copy.description}`.includes("BET_LOCKED"), false);
});

test("result and error copy is player-friendly", () => {
  assert.equal(resultPopupCopy("WON").title, "You won");
  assert.equal(resultPopupCopy("LOST").title, "You lost");
  assert.equal(errorToPlayerMessage(new Error("ROUND_NOT_OPEN")), "Betting is closed for this round.");
  assert.equal(errorToPlayerMessage(new Error("API error: unexpected")), "Something went wrong. Please try again.");
  assert.equal(playerConnectionCopy.disconnected, "Connection lost. Trying to reconnect...");
});
