import crypto from "node:crypto";

const acceptedLegacyChecksums = new Map([
  [
    "20260609_add_wallet_transaction_balance_before.sql",
    new Set([
      // This migration was edited after its first production apply. The added
      // SQL now lives in 20260610_add_wallet_transaction_balance_after.sql.
      "6c0bb5fe68b1503c80efee727da7d4ad80f1f4ff6f7b07fbf236048ebc03d11f",
      "defa670d4ff6f402142d6f160c0bf40aaf3b61fcce6b8009fde2f568f110be35",
      "3631d08cc1a096b99f24d94005be26ab64ad617b3ce35f7e1711478db46c0b96",
    ]),
  ],
]);

export function migrationChecksum(sql) {
  return rawChecksum(normalizeLineEndings(sql));
}

export function isCompatibleMigrationChecksum(sql, storedChecksum) {
  return new Set([
    migrationChecksum(sql),
    rawChecksum(sql),
    rawChecksum(normalizeLineEndings(sql).replaceAll("\n", "\r\n")),
  ]).has(storedChecksum);
}

export function isAcceptedLegacyMigrationChecksum(migration, storedChecksum) {
  return acceptedLegacyChecksums.get(migration)?.has(storedChecksum) ?? false;
}

function normalizeLineEndings(value) {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function rawChecksum(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
