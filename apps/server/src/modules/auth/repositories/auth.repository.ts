import crypto from "node:crypto";
import {
  CoinLedgerDirection,
  CoinLedgerStatus,
  CoinLedgerType,
  LedgerReferenceType,
  Prisma,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { logger } from "../../../common/utils/logger.js";

const INITIAL_VIRTUAL_COINS = 1000n;

export const safeUserSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type SafeUser = {
  id: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  role: "USER" | "ADMIN";
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthUserWithPassword = SafeUser & {
  passwordHash: string;
};

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName?: string;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  refreshTokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

export interface RefreshSessionLookupInput {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  now: Date;
}

export interface RefreshRotationInput extends RefreshSessionLookupInput {
  replacementSession: CreateSessionInput;
  userAgent?: string;
}

export interface AuthRepositoryPort {
  findUserIdByEmail(email: string): Promise<{ id: string } | null>;
  createUserWithInitialWallet(input: CreateUserInput): Promise<SafeUser>;
  findUserByEmailWithPassword(email: string): Promise<AuthUserWithPassword | null>;
  updateLastLoginAt(userId: string, loggedInAt: Date): Promise<void>;
  revokeSession(userId: string, sessionId: string, revokedAt: Date): Promise<void>;
  revokeAllSessions(userId: string, revokedAt: Date): Promise<number>;
  rotateRefreshSession(input: RefreshRotationInput, revokedAt: Date): Promise<SafeUser | null>;
  findActiveUserById(userId: string): Promise<SafeUser | null>;
  createSession(input: CreateSessionInput): Promise<void>;
}

export class AuthRepository implements AuthRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  findUserIdByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  }

  createUserWithInitialWallet(input: CreateUserInput) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
        },
        select: safeUserSelect,
      });

      const wallet = await tx.wallet.create({
        data: {
          userId: user.id,
          depositBalance: INITIAL_VIRTUAL_COINS,
          winningBalance: 0n,
        },
        select: { id: true },
      });

      await tx.coinLedger.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          type: CoinLedgerType.BONUS_CREDIT,
          direction: CoinLedgerDirection.CREDIT,
          amountCoins: INITIAL_VIRTUAL_COINS,
          balanceBeforeCoins: 0n,
          balanceAfterCoins: INITIAL_VIRTUAL_COINS,
          idempotencyKey: `user:${user.id}:initial-virtual-coins`,
          referenceType: LedgerReferenceType.ADMIN_ACTION,
          referenceId: user.id,
          status: CoinLedgerStatus.SUCCESS,
          metadata: {
            reason: "INITIAL_SIGNUP_BALANCE",
          },
        },
      });

      return user;
    });
  }

  findUserByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        ...safeUserSelect,
        passwordHash: true,
      },
    });
  }

  async updateLastLoginAt(userId: string, loggedInAt: Date) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: loggedInAt },
    });
  }

  async revokeSession(userId: string, sessionId: string, revokedAt: Date) {
    await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });
  }

  async revokeAllSessions(userId: string, revokedAt: Date) {
    const result = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    return result.count;
  }

  async rotateRefreshSession(input: RefreshRotationInput, revokedAt: Date) {
    try {
      return await this.rotateRefreshSessionOnce(input, revokedAt);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return this.rotateRefreshSessionOnce(input, revokedAt);
      }
      throw error;
    }
  }

  private rotateRefreshSessionOnce(input: RefreshRotationInput, revokedAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findFirst({
        where: {
          id: input.sessionId,
          userId: input.userId,
        },
        select: {
          id: true,
          refreshTokenHash: true,
          userAgent: true,
          revokedAt: true,
          expiresAt: true,
          user: {
            select: safeUserSelect,
          },
        },
      });

      if (!session) {
        await revokeActiveSessions(tx, input.userId, revokedAt);
        logger.warn("AUTH_REFRESH_REPLAY_DETECTED", {
          userId: input.userId,
          sessionId: input.sessionId,
          replayReason: "SESSION_NOT_FOUND",
        });
        return null;
      }

      const replayReason = getRefreshReplayReason(session, input);

      if (replayReason) {
        await revokeActiveSessions(tx, input.userId, revokedAt);
        logger.warn("AUTH_REFRESH_REPLAY_DETECTED", {
          userId: input.userId,
          sessionId: input.sessionId,
          replayReason,
        });
        return null;
      }

      if (hasUserAgentMismatch(session.userAgent, input.userAgent)) {
        logger.warn("AUTH_REFRESH_USER_AGENT_CHANGED", {
          userId: input.userId,
          sessionId: input.sessionId,
          previousUserAgentHash: fingerprintUserAgent(session.userAgent),
          presentedUserAgentHash: fingerprintUserAgent(input.userAgent),
          riskSignal: "USER_AGENT_CHANGED",
          riskPoints: 5,
          // TODO: require step-up verification when UA and trusted device/IP both change.
          stepUpVerificationRecommended: false,
        });
      }

      if (session.user.status !== UserStatus.ACTIVE) {
        await revokeActiveSessions(tx, input.userId, revokedAt);
        return null;
      }

      const consumed = await tx.authSession.updateMany({
        where: {
          id: session.id,
          userId: input.userId,
          refreshTokenHash: input.refreshTokenHash,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { revokedAt },
      });

      if (consumed.count !== 1) {
        await revokeActiveSessions(tx, input.userId, revokedAt);
        logger.warn("AUTH_REFRESH_REPLAY_DETECTED", {
          userId: input.userId,
          sessionId: input.sessionId,
          replayReason: "ROTATION_RACE_OR_REUSE",
        });
        return null;
      }

      await tx.authSession.create({
        data: {
          id: input.replacementSession.id,
          userId: input.replacementSession.userId,
          refreshTokenHash: input.replacementSession.refreshTokenHash,
          ipAddress: input.replacementSession.ipAddress,
          userAgent: input.replacementSession.userAgent,
          expiresAt: input.replacementSession.expiresAt,
        },
      });

      return session.user;
    }, {
      isolationLevel: "Serializable",
      maxWait: 5000,
      timeout: 15000,
    });
  }

  findActiveUserById(userId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
      },
      select: safeUserSelect,
    });
  }

  async createSession(input: CreateSessionInput) {
    await this.prisma.authSession.create({
      data: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
      },
    });
  }
}

export function hasUserAgentMismatch(
  storedUserAgent: string | null | undefined,
  presentedUserAgent: string | undefined,
) {
  return Boolean(storedUserAgent && presentedUserAgent && storedUserAgent !== presentedUserAgent);
}

export function fingerprintUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) {
    return null;
  }

  return crypto.createHash("sha256").update(userAgent).digest("hex").slice(0, 16);
}

function getRefreshReplayReason(
  session: {
    refreshTokenHash: string;
    revokedAt: Date | null;
    expiresAt: Date;
  },
  input: RefreshSessionLookupInput,
) {
  if (session.refreshTokenHash !== input.refreshTokenHash) {
    return "REFRESH_TOKEN_HASH_MISMATCH";
  }

  if (session.revokedAt !== null) {
    return "SESSION_REVOKED";
  }

  if (session.expiresAt <= input.now) {
    return "SESSION_EXPIRED";
  }

  return null;
}

function revokeActiveSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  revokedAt: Date,
) {
  return tx.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt },
  });
}
