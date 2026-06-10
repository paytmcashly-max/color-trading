import type { NextFunction, Request, Response } from "express";

import { getPrismaClient } from "../../database/prisma.client.js";
import { HttpError } from "../errors/http-error.js";

export function verifiedEmailGuard(req: Request, _res: Response, next: NextFunction) {
  const userId = req.auth?.userId;

  if (!userId) {
    throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  getPrismaClient()
    .user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    })
    .then((user) => {
      if (!user?.emailVerifiedAt) {
        throw new HttpError(
          403,
          "EMAIL_VERIFICATION_REQUIRED",
          "Email verification is required for this sensitive action.",
        );
      }

      next();
    })
    .catch(next);
}
