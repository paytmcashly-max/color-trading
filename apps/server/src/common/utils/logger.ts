import pino from "pino";

import { env } from "../../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;
type LogSink = (entry: { level: LogLevel; message: string; metadata: LogMeta; timestamp: string }) => void;

const minimumLevel: LogLevel = env.NODE_ENV === "production" ? "info" : "debug";
const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|password|passwordHash|secret|token|accessToken|refreshToken|idempotencyKey|seedReveal|ADMIN_PASSWORD|ADMIN_BOOTSTRAP_PASSWORD|ADMIN_BOOTSTRAP_TOKEN|JWT_SECRET|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|COOKIE_SECRET)$/i;
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
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, serializeValue(value, key)]),
  );
}

function serializeValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) {
    return "[REDACTED]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        serializeValue(nestedValue, nestedKey),
      ]),
    );
  }

  return value;
}

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
