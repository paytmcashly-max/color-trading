import { logger } from "../../common/utils/logger.js";
import { publishRealtimeEvent } from "../../sockets/socket.events.js";

export class AlertService {
  send(input: {
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    logger.warn("observability_alert", input);
    publishRealtimeEvent("observability:alert", {
      ...input,
      createdAt: new Date().toISOString(),
    });
  }
}
