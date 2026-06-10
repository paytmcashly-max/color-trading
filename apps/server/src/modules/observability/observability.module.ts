import { setLogSink } from "../../common/utils/logger.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { subscribeToRealtimeEvents } from "../../sockets/socket.events.js";
import { AlertService } from "./alert.service.js";
import { AuditService } from "./audit.service.js";
import { installProcessErrorHandlers } from "./error.handler.js";
import { LoggerService } from "./logger.service.js";
import { MetricsService } from "./metrics.service.js";

let observability: {
  logs: LoggerService;
  metrics: MetricsService;
  audit: AuditService;
  alerts: AlertService;
} | null = null;
let started = false;

export function getObservability() {
  if (!observability) {
    const prisma = getPrismaClient();
    observability = {
      logs: new LoggerService(prisma),
      metrics: new MetricsService(prisma),
      audit: new AuditService(prisma),
      alerts: new AlertService(),
    };
  }

  return observability;
}

export function startObservability() {
  if (started) {
    return;
  }

  const services = getObservability();
  services.logs.start();
  services.metrics.start();
  setLogSink((entry) => services.logs.enqueue(entry));
  installProcessErrorHandlers();
  subscribeToRealtimeEvents((event) => {
    services.logs.enqueue({
      level: "info",
      message: `realtime_${event.name}`,
      metadata: {
        eventId: event.id,
        eventName: event.name,
        payload: event.payload,
        source: event.source,
      },
      timestamp: event.createdAt,
    });

    if (event.name === "bet:placed") {
      services.metrics.incrementCounter("bets");
    }

    if (event.name === "wallet:update") {
      services.metrics.incrementCounter("wallet_transactions");
    }

    if (event.name === "round:settlement") {
      services.metrics.incrementCounter("round_settlements");
    }

    if (event.name === "round:created" && isRecord(event.payload) && isRecord(event.payload.round)) {
      services.metrics.setGauge("current_round_numeric_id", Number(event.payload.round.roundNumber ?? 0));
    }

    if (event.name === "system:error") {
      services.alerts.send({
        type: "SYSTEM_ERROR_EVENT",
        severity: "HIGH",
        message: "System error event emitted.",
        metadata: {
          eventId: event.id,
          payload: event.payload,
        },
      });
    }
  });

  started = true;
}

export async function flushObservability() {
  if (!observability) {
    return;
  }

  await Promise.all([
    observability.logs.flush(),
    observability.metrics.flushSnapshot(),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
