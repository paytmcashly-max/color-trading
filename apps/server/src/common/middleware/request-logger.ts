import type { Request, Response } from "express";
import { pinoHttp } from "pino-http";

import { pinoLogger } from "../utils/logger.js";

export const requestLogger = pinoHttp<Request, Response>({
  logger: pinoLogger,
  autoLogging: false,
  genReqId(req) {
    return req.observability?.requestId ?? "unknown";
  },
  customProps(req) {
    return {
      requestId: req.observability?.requestId,
    };
  },
});
