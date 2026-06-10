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
  const knownChecksums = [
    "6c0bb5fe68b1503c80efee727da7d4ad80f1f4ff6f7b07fbf236048ebc03d11f",
    "defa670d4ff6f402142d6f160c0bf40aaf3b61fcce6b8009fde2f568f110be35",
  ];

  for (const checksum of knownChecksums) {
    assert.equal(
      isAcceptedLegacyMigrationChecksum(
        "20260609_add_wallet_transaction_balance_before.sql",
        checksum,
      ),
      true,
    );
    assert.equal(
      isAcceptedLegacyMigrationChecksum("unrelated.sql", checksum),
      false,
    );
  }
});
