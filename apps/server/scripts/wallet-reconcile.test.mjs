import assert from "node:assert/strict";
import { test } from "node:test";

import { findWalletMismatches } from "./wallet-reconcile.mjs";

test("wallet reconciliation detects snapshot and ledger mismatches", () => {
  const mismatches = findWalletMismatches([
    {
      userId: "user-ok",
      walletId: "wallet-ok",
      depositBalance: "800",
      winningBalance: "200",
      ledgerTotal: "1000",
    },
    {
      userId: "user-bad",
      walletId: "wallet-bad",
      depositBalance: "700",
      winningBalance: "200",
      ledgerTotal: "1000",
    },
  ]);

  assert.deepEqual(mismatches, [{
    userId: "user-bad",
    walletId: "wallet-bad",
    depositBalance: "700",
    winningBalance: "200",
    snapshotTotal: "900",
    ledgerTotal: "1000",
    difference: "-100",
  }]);
});
