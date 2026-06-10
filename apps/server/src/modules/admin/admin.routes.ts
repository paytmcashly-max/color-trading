import { Router } from "express";
import { UserRole } from "@prisma/client";

import { authGuard } from "../../common/guards/auth.guard.js";
import { roleGuard } from "../../common/guards/role.guard.js";
import { verifiedEmailGuard } from "../../common/guards/verified-email.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { WalletRepository } from "../wallet/wallet.repository.js";
import { WalletService } from "../wallet/wallet.service.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import {
  adminWalletAdjustmentSchema,
  forceResultSchema,
  forceStartRoundSchema,
  forceStopRoundSchema,
  gamePauseSchema,
  gameResumeSchema,
} from "./dto/admin.validators.js";

export const adminRouter = Router();

const prisma = getPrismaClient();
const walletService = new WalletService(new WalletRepository(prisma));
const adminService = new AdminService(prisma, walletService);
const adminController = new AdminController(adminService);

adminRouter.use(authGuard, roleGuard(UserRole.ADMIN), verifiedEmailGuard);

adminRouter.get("/dashboard", asyncHandler(adminController.dashboard));
adminRouter.get("/users", asyncHandler(adminController.users));
adminRouter.post("/users/:id/ban", asyncHandler(adminController.banUser));
adminRouter.post("/users/:id/unban", asyncHandler(adminController.unbanUser));

adminRouter.get("/rounds", asyncHandler(adminController.rounds));
adminRouter.get("/rounds/active", asyncHandler(adminController.activeRound));
adminRouter.post(
  "/rounds/force-start",
  validateBody(forceStartRoundSchema),
  asyncHandler(adminController.forceStartRound),
);
adminRouter.post(
  "/rounds/force-stop",
  validateBody(forceStopRoundSchema),
  asyncHandler(adminController.forceStopRound),
);
adminRouter.post(
  "/rounds/force-result",
  validateBody(forceResultSchema),
  asyncHandler(adminController.forceResult),
);

adminRouter.get("/game-control", asyncHandler(adminController.gameControl));
adminRouter.post(
  "/game-control/pause",
  validateBody(gamePauseSchema),
  asyncHandler(adminController.pauseGame),
);
adminRouter.post(
  "/game-control/resume",
  validateBody(gameResumeSchema),
  asyncHandler(adminController.resumeGame),
);

adminRouter.get("/wallet/:userId", asyncHandler(adminController.wallet));
adminRouter.post(
  "/wallet/:userId/adjust",
  validateBody(adminWalletAdjustmentSchema),
  asyncHandler(adminController.adjustWallet),
);
adminRouter.get("/ledger/:userId", asyncHandler(adminController.ledger));

adminRouter.get("/bets", asyncHandler(adminController.bets));
adminRouter.get("/system-health", asyncHandler(adminController.systemHealth));
adminRouter.get("/audit-logs", asyncHandler(adminController.auditLogs));
adminRouter.get("/fraud/logs", asyncHandler(adminController.fraudLogs));
adminRouter.get("/fraud/risk-profiles", asyncHandler(adminController.riskProfiles));
