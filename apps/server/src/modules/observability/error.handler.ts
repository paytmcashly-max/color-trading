import type { Request } from "express";

import { logger } from "../../common/utils/logger.js";
import { getObservability } from "./observability.module.js";

export function captureRequestError(error: unknown, req: Request) {
  logger.error("request_failed", {
    requestId: req.observability?.requestId,
    userId: req.auth?.userId,
    routeName: req.observability?.routeName,
    method: req.method,
    path: req.path,
    error,
  });
}

export function installProcessErrorHandlers() {
  process.on("uncaughtException", (error) => {
    getObservability().metrics.incrementCounter("process_errors");
    logger.error("uncaught_exception", { error });
    getObservability().alerts.send({
      type: "UNCAUGHT_EXCEPTION",
      severity: "HIGH",
      message: "Unhandled exception captured by process handler.",
      metadata: {
        name: error.name,
        message: error.message,
      },
    });
  });

  process.on("unhandledRejection", (reason) => {
    getObservability().metrics.incrementCounter("process_errors");
    logger.error("unhandled_rejection", { reason });
    getObservability().alerts.send({
      type: "UNHANDLED_REJECTION",
      severity: "HIGH",
      message: "Unhandled promise rejection captured by process handler.",
      metadata: {
        reason: String(reason),
      },
    });
  });
}
