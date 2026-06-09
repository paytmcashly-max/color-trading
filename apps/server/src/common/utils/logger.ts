import { env } from "../../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;
type LogSink = (entry: { level: LogLevel; message: string; metadata: LogMeta; timestamp: string }) => void;

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minimumLevel: LogLevel = env.NODE_ENV === "production" ? "info" : "debug";
let logSink: LogSink | null = null;

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

export function setLogSink(sink: LogSink) {
  logSink = sink;
}

function writeLog(level: LogLevel, message: string, meta: LogMeta = {}) {
  if (levelPriority[level] < levelPriority[minimumLevel]) {
    return;
  }

  const payload = {
    level,
    message,
    service: "color-trading-server",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    ...serializeMeta(meta),
  };

  logSink?.({
    level,
    message,
    metadata: serializeMeta(meta),
    timestamp: payload.timestamp,
  });

  const line = env.NODE_ENV === "production" ? JSON.stringify(payload) : payload;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

function serializeMeta(meta: LogMeta) {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, serializeValue(value)]),
  );
}

function serializeValue(value: unknown): unknown {
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

  return value;
}
