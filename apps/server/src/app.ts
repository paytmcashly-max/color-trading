import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { healthRouter } from "./common/health/health.routes.js";
import { errorHandler } from "./common/middleware/error-handler.js";
import {
  globalApiRateLimiter,
  mutationRateLimiter,
} from "./common/middleware/global-rate-limit.js";
import { requestLogger } from "./common/middleware/request-logger.js";
import { securityMiddleware } from "./common/middleware/security.middleware.js";
import { HttpError } from "./common/errors/http-error.js";
import { versionRouter } from "./common/version/version.routes.js";
import { registerModuleRoutes } from "./modules/index.js";
import { requestTracer } from "./modules/observability/requestTracer.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
      hsts:
        env.NODE_ENV === "production"
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new HttpError(403, "CORS_ORIGIN_DENIED", "Request origin is not allowed."));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-request-id"],
      exposedHeaders: ["x-request-id", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(requestTracer);
  app.use(requestLogger);
  app.use(
    express.json({
      limit: "256kb",
      strict: true,
      verify(req, _res, buffer) {
        (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(securityMiddleware);

  app.use("/health", healthRouter);
  app.use("/version", versionRouter);
  app.use(globalApiRateLimiter);
  app.use(mutationRateLimiter);
  registerModuleRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found",
      data: {
        code: "NOT_FOUND",
      },
    });
  });
  app.use(errorHandler);

  return app;
}
