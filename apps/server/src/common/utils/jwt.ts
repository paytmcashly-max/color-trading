import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

import { env } from "../../config/env.js";
import { HttpError } from "../errors/http-error.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  tokenType: "refresh";
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as jwt.JwtPayload;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.sessionId !== "string"
    ) {
      throw new Error("Invalid access token payload");
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      sessionId: payload.sessionId,
    };
  } catch {
    throw new HttpError(401, "INVALID_TOKEN", "Invalid or expired access token.");
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as jwt.JwtPayload;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sessionId !== "string" ||
      payload.tokenType !== "refresh"
    ) {
      throw new Error("Invalid refresh token payload");
    }

    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      tokenType: "refresh",
    };
  } catch {
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Invalid or expired refresh token.");
  }
}
