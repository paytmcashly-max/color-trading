import assert from "node:assert/strict";
import test from "node:test";

import {
  isAcceptedLegacyMigrationChecksum,
  isCompatibleMigrationChecksum,
  migrationChecksum,
} from "./migration-checksum.mjs";

test("migration checksums are stable across LF and CRLF working trees", () => {
  const lfSql = "ALTER TABLE users\nADD COLUMN nickname TEXT;\n";
  const crlfSql = lfSql.replaceAll("\n", "\r\n");

  assert.equal(migrationChecksum(lfSql), migrationChecksum(crlfSql));
});

test("migration checksum accepts a legacy CRLF checksum before normalization", async () => {
  const crypto = await import("node:crypto");
  const lfSql = "CREATE INDEX users_email_idx\nON users(email);\n";
  const crlfSql = lfSql.replaceAll("\n", "\r\n");
  const legacyChecksum = crypto
    .createHash("sha256")
    .update(crlfSql)
    .digest("hex");

  assert.equal(isCompatibleMigrationChecksum(lfSql, legacyChecksum), true);
});

test("only the known historical wallet migration accepts its edited checksum", () => {
  const editedChecksum =
    "defa670d4ff6f402142d6f160c0bf40aaf3b61fcce6b8009fde2f568f110be35";

  assert.equal(
    isAcceptedLegacyMigrationChecksum(
      "20260609_add_wallet_transaction_balance_before.sql",
      editedChecksum,
    ),
    true,
  );
  assert.equal(
    isAcceptedLegacyMigrationChecksum("unrelated.sql", editedChecksum),
    false,
  );
});
