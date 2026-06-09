import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { logger } from "../../common/utils/logger.js";
import { getObservability } from "./observability.module.js";

const latencySamples: number[] = [];
const MAX_LATENCY_SAMPLES = 200;

export function requestTracer(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const routeName = `${req.method} ${req.path}`;

  req.observability = {
    requestId,
    startedAt,
    routeName,
  };
  res.setHeader("x-request-id", requestId);

  logger.info("request_started", {
    requestId,
    routeName,
    method: req.method,
    path: req.path,
    timestamp: new Date(startedAt).toISOString(),
  });

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const userId = req.auth?.userId;
    const observability = getObservability();

    latencySamples.push(durationMs);
    while (latencySamples.length > MAX_LATENCY_SAMPLES) {
      latencySamples.shift();
    }

    const averageLatency = Math.round(
      latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length,
    );

    observability.metrics.setGauge("average_http_latency_ms", averageLatency);

    if (res.statusCode >= 500) {
      observability.metrics.incrementCounter("http_errors");
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
