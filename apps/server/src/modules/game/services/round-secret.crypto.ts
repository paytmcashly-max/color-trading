import crypto from "node:crypto";

import { env } from "../../../config/env.js";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";

export function encryptRoundSeedReveal(seedReveal: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(seedReveal, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptRoundSeedReveal(encrypted: string) {
  const [version, ivValue, authTagValue, ciphertextValue] = encrypted.split(".");

  if (version !== FORMAT_VERSION || !ivValue || !authTagValue || !ciphertextValue) {
    throw new Error("Unsupported or malformed encrypted round seed.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encryptionKey() {
  const secret =
    env.ROUND_SEED_ENCRYPTION_KEY ??
    env.COOKIE_SECRET ??
    env.JWT_REFRESH_SECRET;

  return crypto.createHash("sha256").update(secret).digest();
}
