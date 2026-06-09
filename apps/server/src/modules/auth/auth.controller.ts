import type { Request, Response } from "express";

import { getFraudService } from "../fraud/fraud.module.js";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response) => {
    const result = await this.authService.register(req.body, getRequestMetadata(req));
    void getFraudService().observeAuthenticatedSession(result.user.id, req);

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: result,
    });
  };

  login = async (req: Request, res: Response) => {
    const result = await this.authService.login(req.body, getRequestMetadata(req));
    void getFraudService().observeAuthenticatedSession(result.user.id, req);

    res.status(200).json({
      success: true,
      message: "User logged in successfully.",
      data: result,
    });
  };

  logout = async (req: Request, res: Response) => {
    await this.authService.logout(req.auth!.userId, req.auth!.sessionId);

    res.status(200).json({
      success: true,
      message: "User logged out successfully.",
      data: null,
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
