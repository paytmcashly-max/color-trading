import { Router } from "express";

import { env } from "../../config/env.js";

export const versionRouter = Router();

versionRouter.get("/", (_req, res) => {
  res.status(200).json({
    service: "color-trading-server",
    apiVersion: env.API_VERSION,
    releaseVersion: env.RELEASE_VERSION,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});
