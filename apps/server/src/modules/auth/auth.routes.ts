import { Router } from "express";
import rateLimit from "express-rate-limit";

import { authGuard } from "../../common/guards/auth.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { fraudAuthRateLimit } from "../fraud/fraud.middleware.js";
import { AuthController } from "./controllers/auth.controller.js";
import { loginSchema, registerSchema } from "./dto/validators/auth.validators.js";
import { AuthService } from "./services/auth.service.js";

export const authRouter = Router();

const authService = new AuthService(getPrismaClient());
const authController = new AuthController(authService);

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts. Please try again later.",
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
authRouter.post("/logout", authGuard, asyncHandler(authController.logout));
authRouter.get("/me", authGuard, asyncHandler(authController.me));
