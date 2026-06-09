import type { ExtendedError, Socket } from "socket.io";

import { verifyAccessToken } from "../common/utils/jwt.js";
import { getPrismaClient } from "../database/prisma.client.js";

export interface SocketUserContext {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

export async function authenticateSocket(
  socket: Socket,
  next: (error?: ExtendedError) => void,
) {
  try {
    const token = extractToken(socket);

    if (!token) {
      next(new Error("Socket authentication token is required."));
      return;
    }

    const payload = verifyAccessToken(token);
    const session = await getPrismaClient().authSession.findFirst({
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
    });

    if (!session) {
      next(new Error("Socket session is no longer active."));
      return;
    }

    if (session.user.status !== "ACTIVE") {
      next(new Error("Socket user is not active."));
      return;
    }

    socket.data.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      sessionId: payload.sessionId,
    } satisfies SocketUserContext;

    next();
  } catch {
    next(new Error("Socket authentication failed."));
  }
}

function extractToken(socket: Socket) {
  const authToken = socket.handshake.auth.token;

  if (typeof authToken === "string") {
    return authToken;
  }

  const authorization = socket.handshake.headers.authorization;

  if (typeof authorization !== "string") {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  return scheme === "Bearer" && token ? token : null;
}
