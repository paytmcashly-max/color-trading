import { LogLevel, type Prisma, type PrismaClient } from "@prisma/client";

import { sanitizeLogMetadata } from "../../common/utils/logger.js";

interface QueuedLog {
  level: LogLevel;
  message: string;
  metadata?: Prisma.InputJsonValue;
  createdAt: Date;
}

const FLUSH_INTERVAL_MS = 1000;
const MAX_BATCH_SIZE = 100;
const MAX_QUEUE_SIZE = 5000;

export class LoggerService {
  private queue: QueuedLog[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(private readonly prisma: PrismaClient) {}

  start() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  enqueue(input: {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    metadata?: Record<string, unknown>;
    timestamp?: string;
  }) {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
    }

    this.queue.push({
      level: toPrismaLogLevel(input.level),
      message: input.message.slice(0, 240),
      metadata: input.metadata ? toJsonObject(sanitizeLogMetadata(input.metadata)) : undefined,
      createdAt: input.timestamp ? new Date(input.timestamp) : new Date(),
    });

    if (this.queue.length >= MAX_BATCH_SIZE) {
      void this.flush();
    }
  }

  async flush() {
    if (this.flushing || this.queue.length === 0) {
      return;
    }

    this.flushing = true;
    const batch = this.queue.splice(0, MAX_BATCH_SIZE);

    try {
      await this.prisma.logEntry.createMany({
        data: batch,
      });
    } catch (error) {
      this.queue.unshift(...batch.slice(0, MAX_BATCH_SIZE));
      console.warn("observability_log_flush_failed", error);
    } finally {
      this.flushing = false;
    }
  }
}

function toPrismaLogLevel(level: "debug" | "info" | "warn" | "error") {
  const map = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  } as const;

  return map[level];
}

function toJsonObject(metadata: Record<string, unknown>): Prisma.InputJsonObject {
  return metadata as Prisma.InputJsonObject;
}
