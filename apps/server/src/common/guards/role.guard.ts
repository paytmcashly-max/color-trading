import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";

import { HttpError } from "../errors/http-error.js";

export function roleGuard(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required.");
    }

    if (!allowedRoles.includes(req.auth.role)) {
      throw new HttpError(403, "FORBIDDEN", "Insufficient permissions.");
    }

    next();
  };
}
