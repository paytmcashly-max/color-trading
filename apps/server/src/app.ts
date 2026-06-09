import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { healthRouter } from "./common/health/health.routes.js";
import { errorHandler } from "./common/middleware/error-handler.js";
import { globalApiRateLimiter } from "./common/middleware/global-rate-limit.js";
import { versionRouter } from "./common/version/version.routes.js";
import { registerModuleRoutes } from "./modules/index.js";
import { requestTracer } from "./modules/observability/requestTracer.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(requestTracer);
  app.use(express.json({ limit: "1mb" }));
  app.use(globalApiRateLimiter);

  app.use("/health", healthRouter);
  app.use("/version", versionRouter);
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
