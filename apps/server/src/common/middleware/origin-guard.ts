import type { NextFunction, Request, Response } from "express";

import { env } from "../../config/env.js";
import { HttpError } from "../errors/http-error.js";

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  assertTrustedOrigin(req);
  next();
}

export function assertTrustedOrigin(req: Pick<Request, "get">) {
  const origin = req.get("origin");

  if (!origin) {
    if (env.NODE_ENV === "production") {
      throw new HttpError(403, "ORIGIN_REQUIRED", "Origin header is required.");
    }

    return;
  }

  if (!env.ALLOWED_ORIGINS.includes(origin)) {
    throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
  }
}
