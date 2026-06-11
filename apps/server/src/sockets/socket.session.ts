import type { PrismaClient } from "@prisma/client";

import { HttpError } from "../common/errors/http-error.js";
import type { SocketUserContext } from "./socket.auth.js";

export async function assertSocketSessionActive(
  prisma: Pick<PrismaClient, "authSession">,
  user: SocketUserContext,
) {
  const session = await prisma.authSession.findFirst({
    where: {
      id: user.sessionId,
      userId: user.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      user: { select: { status: true } },
    },
  });

  if (!session) {
    throw new HttpError(401, "SESSION_REVOKED", "Socket session is no longer active.");
  }

  if (session.user.status !== "ACTIVE") {
    throw new HttpError(401, "USER_NOT_ACTIVE", "Socket user is not active.");
  }
}

export async function revalidateSocketSession(
  prisma: Pick<PrismaClient, "authSession">,
  user: SocketUserContext,
  disconnect: () => void,
) {
  try {
    await assertSocketSessionActive(prisma, user);
    return true;
  } catch {
    disconnect();
    return false;
  }
}

export async function authorizeSocketSession(
  prisma: Pick<PrismaClient, "authSession">,
  user: SocketUserContext,
  notifyRevoked: () => void,
  disconnect: () => void,
) {
  try {
    await assertSocketSessionActive(prisma, user);
    return true;
  } catch {
    notifyRevoked();
    disconnect();
    return false;
  }
}
