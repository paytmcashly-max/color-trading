import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { logger } from "../../common/utils/logger.js";
import { getObservability } from "./observability.module.js";

const MAX_REQUEST_ID_LENGTH = 128;

export function requestTracer(req: Request, res: Response, next: NextFunction) {
  const requestId = getRequestId(req);
  const startedAt = Date.now();
  const routeName = `${req.method} ${req.path}`;
  const isProbe = req.path === "/health/live" || req.path === "/health/ready";

  req.observability = {
    requestId,
    startedAt,
    routeName,
  };
  res.setHeader("x-request-id", requestId);

  if (!isProbe) {
    logger.info("request_started", {
      requestId,
      routeName,
      method: req.method,
      path: req.path,
      timestamp: new Date(startedAt).toISOString(),
    });
  }

  res.on("finish", () => {
    if (isProbe) {
      return;
    }

    const durationMs = Date.now() - startedAt;
    const userId = req.auth?.userId;
    const observability = getObservability();

    observability.metrics.incrementCounter("http_requests");
    observability.metrics.recordMeasurement("http_latency_ms", durationMs);

    if (res.statusCode >= 500) {
      observability.metrics.incrementCounter("http_errors");
      observability.metrics.incrementCounter("http_5xx");
      const errorsPerMinute = observability.metrics.getPerMinute("http_errors");

      if (errorsPerMinute >= 10) {
        observability.alerts.send({
          type: "ERROR_RATE_SPIKE",
          severity: "HIGH",
          message: "HTTP 5xx error rate exceeded threshold.",
          metadata: {
            errorsPerMinute,
            requestId,
            routeName,
          },
        });
      }
    } else if (res.statusCode >= 400) {
      observability.metrics.incrementCounter("http_4xx");
    }

    logger.info("request_completed", {
      requestId,
      userId,
      routeName,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  });

  next();
}

function getRequestId(req: Request) {
  const header = req.get("x-request-id")?.trim();

  if (header && header.length <= MAX_REQUEST_ID_LENGTH && /^[a-zA-Z0-9._:-]+$/.test(header)) {
    return header;
  }

  return crypto.randomUUID();
}
