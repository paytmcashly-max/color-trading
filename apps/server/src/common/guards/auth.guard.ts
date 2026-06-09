import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../errors/http-error.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { getPrismaClient } from "../../database/prisma.client.js";

export function authGuard(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "AUTH_REQUIRED", "Bearer access token is required.");
  }

  const payload = verifyAccessToken(token);

  req.auth = {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    sessionId: payload.sessionId,
  };

  getPrismaClient()
    .authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    })
    .then((session) => {
      if (!session) {
        throw new HttpError(401, "SESSION_REVOKED", "Session is no longer active.");
      }

      if (session.user.status !== "ACTIVE") {
        throw new HttpError(401, "USER_NOT_ACTIVE", "Authenticated user is not active.");
      }

      next();
    })
    .catch(next);
}
