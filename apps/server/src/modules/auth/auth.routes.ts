import { Router } from "express";
import rateLimit from "express-rate-limit";

import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { fraudAuthRateLimit } from "../fraud/fraud.middleware.js";
import { AuthController } from "./auth.controller.js";
import { loginSchema, refreshTokenSchema, registerSchema } from "./auth.dto.js";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./repositories/auth.repository.js";

export const authRouter = Router();

const authRepository = new AuthRepository(getPrismaClient());
const authService = new AuthService(authRepository);
const authController = new AuthController(authService);

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    data: {
      code: "RATE_LIMITED",
    },
  },
});

authRouter.post(
  "/register",
  authRateLimiter,
  fraudAuthRateLimit,
  validateBody(registerSchema),
  asyncHandler(authController.register),
);
authRouter.post(
  "/login",
  authRateLimiter,
  fraudAuthRateLimit,
  validateBody(loginSchema),
  asyncHandler(authController.login),
);
authRouter.post("/logout", authMiddleware, asyncHandler(authController.logout));
authRouter.post(
  "/refresh",
  authRateLimiter,
  fraudAuthRateLimit,
  validateBody(refreshTokenSchema),
  asyncHandler(authController.refresh),
);
authRouter.get("/me", authMiddleware, asyncHandler(authController.me));
