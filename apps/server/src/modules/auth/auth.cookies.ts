import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { API_PREFIX } from "../../common/http/api-prefix.js";

interface InternalTokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
}

export const REFRESH_TOKEN_COOKIE_NAME =
  env.NODE_ENV === "production" ? "__Secure-color_trading_refresh" : "color_trading_refresh";

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: `${API_PREFIX}/auth`,
  maxAge: env.JWT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
} as const;

export function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, refreshCookieOptions);
}

export function clearRefreshTokenCookie(res: Response) {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    ...refreshCookieOptions,
    maxAge: undefined,
  });
}

export function readRefreshTokenCookie(req: Request) {
  const rawCookie = req.headers.cookie;

  if (!rawCookie) {
    return null;
  }

  const cookies = rawCookie.split(";").map((part) => part.trim());

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = cookie.slice(0, separatorIndex);

    if (key !== REFRESH_TOKEN_COOKIE_NAME) {
      continue;
    }

    return decodeURIComponent(cookie.slice(separatorIndex + 1));
  }

  return null;
}

export function stripRefreshToken(tokens: InternalTokenPair) {
  return {
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresInSeconds: tokens.expiresInSeconds,
  };
}
