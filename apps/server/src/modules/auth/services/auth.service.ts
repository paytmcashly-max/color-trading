import crypto from "node:crypto";
import {
  CoinLedgerDirection,
  CoinLedgerStatus,
  CoinLedgerType,
  LedgerReferenceType,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { HttpError } from "../../../common/errors/http-error.js";
import { signAccessToken, signRefreshToken } from "../../../common/utils/jwt.js";
import { hashToken } from "../../../common/utils/token-hash.js";
import { env } from "../../../config/env.js";
import type { LoginDto, RegisterDto } from "../dto/auth.dto.js";
import { hashPassword, verifyPassword } from "./password.service.js";

const INITIAL_VIRTUAL_COINS = 1000n;

interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(dto: RegisterDto, metadata: RequestMetadata) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered.");
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName,
        },
        select: safeUserSelect,
      });

      const wallet = await tx.wallet.create({
        data: {
          userId: createdUser.id,
          depositBalance: INITIAL_VIRTUAL_COINS,
          winningBalance: 0n,
        },
        select: { id: true },
      });

      await tx.coinLedger.create({
        data: {
          userId: createdUser.id,
          walletId: wallet.id,
          type: CoinLedgerType.BONUS_CREDIT,
          direction: CoinLedgerDirection.CREDIT,
          amountCoins: INITIAL_VIRTUAL_COINS,
          balanceAfterCoins: INITIAL_VIRTUAL_COINS,
          idempotencyKey: `user:${createdUser.id}:initial-virtual-coins`,
          referenceType: LedgerReferenceType.ADMIN_ACTION,
          referenceId: createdUser.id,
          status: CoinLedgerStatus.SUCCESS,
          metadata: {
            reason: "INITIAL_SIGNUP_BALANCE",
          },
        },
      });

      return createdUser;
    });

    return this.createTokenPair(user, metadata);
  }

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        ...safeUserSelect,
        passwordHash: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const passwordMatches = await verifyPassword(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createTokenPair(user, metadata);
  }

  async logout(userId: string, sessionId: string) {
    await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: safeUserSelect,
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new HttpError(401, "USER_NOT_ACTIVE", "Authenticated user is not active.");
    }

    return { user };
  }

  private async createTokenPair(user: SafeUser, metadata: RequestMetadata) {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    });
    const refreshToken = signRefreshToken({
      sub: user.id,
      sessionId,
      tokenType: "refresh",
    });

    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        expiresAt,
      },
    });

    return {
      user,
      tokens: {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresInSeconds: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
      },
    };
  }
}

const safeUserSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SafeUser = {
  id: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  role: "USER" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
};
