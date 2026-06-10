import assert from "node:assert/strict";
import test from "node:test";

import {
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
