import type { Request, Response } from "express";

import { HttpError } from "../../../common/errors/http-error.js";
import { getFraudService } from "../../fraud/fraud.module.js";
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
  stripRefreshToken,
} from "../auth.cookies.js";
import type { AuthService } from "../services/auth.service.js";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response) => {
    const result = await this.authService.register(req.body, getRequestMetadata(req));
    void getFraudService().observeAuthenticatedSession(result.user.id, req);
    setRefreshTokenCookie(res, result.tokens.refreshToken);

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: {
        user: result.user,
        tokens: stripRefreshToken(result.tokens),
      },
    });
  };

  login = async (req: Request, res: Response) => {
    const result = await this.authService.login(req.body, getRequestMetadata(req));
    void getFraudService().observeAuthenticatedSession(result.user.id, req);
    setRefreshTokenCookie(res, result.tokens.refreshToken);

    res.status(200).json({
      success: true,
      message: "User logged in successfully.",
      data: {
        user: result.user,
        tokens: stripRefreshToken(result.tokens),
      },
    });
  };

  logout = async (req: Request, res: Response) => {
    await this.authService.logout(req.auth!.userId, req.auth!.sessionId);
    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message: "User logged out successfully.",
      data: null,
    });
  };

  logoutAll = async (req: Request, res: Response) => {
    const result = await this.authService.logoutAll(req.auth!.userId);
    clearRefreshTokenCookie(res);

    res.status(200).json({
      success: true,
      message: "All sessions logged out successfully.",
      data: result,
    });
  };

  refresh = async (req: Request, res: Response) => {
    const refreshToken = readRefreshTokenCookie(req);

    if (!refreshToken) {
      throw new HttpError(401, "REFRESH_TOKEN_REQUIRED", "Refresh session cookie is required.");
    }

    const result = await this.authService.refresh({ refreshToken }, getRequestMetadata(req));
    setRefreshTokenCookie(res, result.tokens.refreshToken);

    res.status(200).json({
      success: true,
      message: "Session refreshed successfully.",
      data: {
        user: result.user,
        tokens: stripRefreshToken(result.tokens),
      },
    });
  };

  me = async (req: Request, res: Response) => {
    const result = await this.authService.me(req.auth!.userId);

    res.status(200).json({
      success: true,
      message: "Authenticated user fetched successfully.",
      data: result,
    });
  };
}

function getRequestMetadata(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  };
}
