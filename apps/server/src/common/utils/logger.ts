import pino from "pino";

import { env } from "../../config/env.js";
import { redactSensitiveData } from "../security/redact.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;
type LogSink = (entry: { level: LogLevel; message: string; metadata: LogMeta; timestamp: string }) => void;

const minimumLevel: LogLevel = env.NODE_ENV === "production" ? "info" : "debug";
let logSink: LogSink | null = null;

export const pinoLogger = pino({
  level: minimumLevel,
  base: {
    service: "color-trading-server",
    environment: env.NODE_ENV,
    releaseVersion: env.RELEASE_VERSION,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "*.password",
      "*.payload.password",
      "passwordHash",
      "*.passwordHash",
      "secret",
      "*.secret",
      "JWT_SECRET",
      "*.JWT_SECRET",
      "JWT_ACCESS_SECRET",
      "*.JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "*.JWT_REFRESH_SECRET",
      "COOKIE_SECRET",
      "*.COOKIE_SECRET",
      "ROUND_SEED_ENCRYPTION_KEY",
      "*.ROUND_SEED_ENCRYPTION_KEY",
      "DATABASE_URL",
      "*.DATABASE_URL",
      "REDIS_URL",
      "*.REDIS_URL",
      "ADMIN_PASSWORD",
      "*.ADMIN_PASSWORD",
      "ADMIN_BOOTSTRAP_PASSWORD",
      "*.ADMIN_BOOTSTRAP_PASSWORD",
      "ADMIN_BOOTSTRAP_TOKEN",
      "*.ADMIN_BOOTSTRAP_TOKEN",
      "authorization",
      "*.authorization",
      "req.headers.authorization",
      "cookie",
      "*.cookie",
      "req.headers.cookie",
      "accessToken",
      "*.accessToken",
      "refreshToken",
      "*.refreshToken",
      "token",
      "*.token",
      "idempotencyKey",
      "*.idempotencyKey",
      "seedReveal",
      "*.seedReveal",
      "*.payload.seedReveal",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    error: pino.stdSerializers.err,
    err: pino.stdSerializers.err,
  },
});

export const logger = {
  debug(message: string, meta?: LogMeta) {
    writeLog("debug", message, meta);
  },
  info(message: string, meta?: LogMeta) {
    writeLog("info", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    writeLog("warn", message, meta);
  },
  error(message: string, meta?: LogMeta) {
    writeLog("error", message, meta);
  },
};

export function setLogSink(sink: LogSink | null) {
  logSink = sink;
}

function writeLog(level: LogLevel, message: string, meta: LogMeta = {}) {
  if (!pinoLogger.isLevelEnabled(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  const metadata = serializeMeta(meta);

  logSink?.({
    level,
    message,
    metadata,
    timestamp,
  });

  pinoLogger[level](metadata, message);
}

function serializeMeta(meta: LogMeta) {
  return redactSensitiveData(meta);
}

export function sanitizeLogMetadata(meta: LogMeta) {
  return serializeMeta(meta);
}
