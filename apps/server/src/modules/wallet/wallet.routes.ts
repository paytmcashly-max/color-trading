import { Router } from "express";
import { authGuard } from "../../common/guards/auth.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { getPrismaClient } from "../../database/prisma.client.js";
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
