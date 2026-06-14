import assert from "node:assert/strict";
import test from "node:test";

import { findRealMoneyMismatches } from "./real-money-game-reconcile.mjs";

test("real-money reconciliation detects snapshot mismatch", () => {
  const rows = findRealMoneyMismatches([{
    walletId: "wallet-1", userId: "user-1", availablePaise: "100", lockedPaise: "50",
    ledgerAvailablePaise: "90", ledgerLockedPaise: "50",
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].availableDifference, "10");
});
