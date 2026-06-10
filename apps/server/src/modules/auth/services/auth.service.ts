import crypto from "node:crypto";
import { UserStatus } from "@prisma/client";

import { HttpError } from "../../../common/errors/http-error.js";
import { logger } from "../../../common/utils/logger.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../../common/utils/jwt.js";
import { hashToken } from "../../../common/utils/token-hash.js";
import { env } from "../../../config/env.js";
import type { LoginDto, RefreshTokenDto, RegisterDto } from "../dto/auth.dto.js";
import type { AuthRepositoryPort, SafeUser } from "../repositories/auth.repository.js";
import { hashPassword, verifyPassword } from "./password.service.js";

interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export class AuthService {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  async register(dto: RegisterDto, metadata: RequestMetadata) {
    const existingUser = await this.authRepository.findUserIdByEmail(dto.email);

    if (existingUser) {
      throw new HttpError(
        409,
        "REGISTRATION_UNAVAILABLE",
        "Unable to create an account with the provided details.",
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.authRepository.createUserWithInitialWallet({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
    });

    return this.createTokenPair(user, metadata);
  }

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const user = await this.authRepository.findUserByEmailWithPassword(dto.email);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const passwordMatches = await verifyPassword(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    await this.authRepository.updateLastLoginAt(user.id, new Date());

    return this.createTokenPair(user, metadata);
  }

  async logout(userId: string, sessionId: string) {
    await this.authRepository.revokeSession(userId, sessionId, new Date());

    return { success: true };
  }

  async logoutAll(userId: string) {
    const revokedSessionCount = await this.authRepository.revokeAllSessions(userId, new Date());

    return { success: true, revokedSessionCount };
  }

  async refresh(dto: RefreshTokenDto, metadata: RequestMetadata) {
    const payload = verifyRefreshToken(dto.refreshToken);
    const refreshTokenHash = hashToken(dto.refreshToken);
    const now = new Date();
    const replacementSessionId = crypto.randomUUID();
    const replacementRefreshToken = signRefreshToken({
      sub: payload.sub,
      sessionId: replacementSessionId,
      tokenType: "refresh",
    });
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const user = await this.authRepository.rotateRefreshSession(
      {
        sessionId: payload.sessionId,
        userId: payload.sub,
        refreshTokenHash,
        now,
        userAgent: metadata.userAgent,
        replacementSession: {
          id: replacementSessionId,
          userId: payload.sub,
          refreshTokenHash: hashToken(replacementRefreshToken),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          expiresAt,
        },
      },
      now,
    );

    if (!user || user.status !== UserStatus.ACTIVE) {
      logger.warn("refresh_token_replay_or_invalid", {
        userId: payload.sub,
        sessionId: payload.sessionId,
        ipAddress: metadata.ipAddress,
      });
      throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token.");
    }

    return this.formatTokenPair(user, replacementSessionId, replacementRefreshToken);
  }

  async me(userId: string) {
    const user = await this.authRepository.findActiveUserById(userId);

    if (!user) {
      throw new HttpError(401, "USER_NOT_ACTIVE", "Authenticated user is not active.");
    }

    return { user };
  }

  private async createTokenPair(user: SafeUser, metadata: RequestMetadata) {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const refreshToken = signRefreshToken({
      sub: user.id,
      sessionId,
      tokenType: "refresh",
    });

    await this.authRepository.createSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      expiresAt,
    });

    return this.formatTokenPair(user, sessionId, refreshToken);
  }

  private formatTokenPair(user: SafeUser, sessionId: string, refreshToken: string) {
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    });

    return {
      user,
      tokens: {
        accessToken,
        refreshToken,
        tokenType: "Bearer" as const,
        expiresInSeconds: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
      },
    };
  }
}
