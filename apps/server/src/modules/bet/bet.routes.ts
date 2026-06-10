import { Router } from "express";

import { authGuard } from "../../common/guards/auth.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { fraudBetGuard } from "../fraud/fraud.middleware.js";
import { WalletRepository } from "../wallet/wallet.repository.js";
import { WalletService } from "../wallet/wallet.service.js";
import { BetController } from "./controllers/bet.controller.js";
import { placeBetSchema } from "./dto/place-bet.dto.js";
import { BetRepository } from "./repositories/bet.repository.js";
import { BetService } from "./services/bet.service.js";

export const betRouter = Router();

const prisma = getPrismaClient();
const betService = new BetService(
  new BetRepository(prisma),
  new WalletService(new WalletRepository(prisma)),
);
const betController = new BetController(betService);

betRouter.get("/options", asyncHandler(betController.options));
betRouter.get("/mine", authGuard, asyncHandler(betController.mine));
betRouter.post(
  "/",
  authGuard,
  validateBody(placeBetSchema),
  fraudBetGuard,
  asyncHandler(betController.placeBet),
);
