import { Router } from "express";
import { UserRole } from "@prisma/client";

import { authGuard } from "../../common/guards/auth.guard.js";
import { roleGuard } from "../../common/guards/role.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { adminAdjustmentSchema, ledgerMutationSchema } from "./dto/wallet.dto.js";
import { WalletController } from "./wallet.controller.js";
import { WalletRepository } from "./wallet.repository.js";
import { WalletService } from "./wallet.service.js";

export const walletRouter = Router();

const walletRepository = new WalletRepository(getPrismaClient());
const walletService = new WalletService(walletRepository);
const walletController = new WalletController(walletService);

walletRouter.get("/balance", authGuard, asyncHandler(walletController.balance));
walletRouter.get("/", authGuard, asyncHandler(walletController.balance));
walletRouter.get("/ledger", authGuard, asyncHandler(walletController.history));
walletRouter.get("/transactions", authGuard, asyncHandler(walletController.transactions));

walletRouter.post(
  "/bonus-credit",
  authGuard,
  roleGuard(UserRole.ADMIN),
  validateBody(ledgerMutationSchema),
  asyncHandler(walletController.bonusCredit),
);

walletRouter.post(
  "/bet-debit",
  authGuard,
  roleGuard(UserRole.ADMIN),
  validateBody(ledgerMutationSchema),
  asyncHandler(walletController.betDebit),
);

walletRouter.post(
  "/admin/users/:userId/adjust",
  authGuard,
  roleGuard(UserRole.ADMIN),
  validateBody(adminAdjustmentSchema),
  asyncHandler(walletController.adminAdjustment),
);
