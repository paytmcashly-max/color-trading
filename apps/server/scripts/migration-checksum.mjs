import crypto from "node:crypto";

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

function normalizeLineEndings(value) {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function rawChecksum(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
