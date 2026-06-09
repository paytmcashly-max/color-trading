import { Router } from "express";

import { HealthController } from "../../modules/observability/health.controller.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const healthRouter = Router();

const healthController = new HealthController();

healthRouter.get("/", asyncHandler(healthController.root));
healthRouter.get("/db", asyncHandler(healthController.db));
healthRouter.get("/redis", asyncHandler(healthController.redis));
healthRouter.get("/socket", asyncHandler(healthController.socket));
healthRouter.get("/metrics", asyncHandler(healthController.metrics));
