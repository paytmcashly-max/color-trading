import { Router } from "express";

import { authGuard } from "../../common/guards/auth.guard.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { validateBody } from "../../common/middleware/validate-request.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { fraudBetGuard } from "../fraud/fraud.middleware.js";
import { BetRepository } from "../bet/repositories/bet.repository.js";
import { WalletRepository } from "../wallet/wallet.repository.js";
import { WalletService } from "../wallet/wallet.service.js";
import { BetController } from "./controllers/bet.controller.js";
import { RoundController } from "./controllers/round.controller.js";
import { placeBetSchema } from "./dto/place-bet.dto.js";
import { GameRepository } from "./repositories/game.repository.js";
import { BetService } from "./services/bet.service.js";
import { RoundService } from "./services/round.service.js";

export const gameRouter = Router();

const prisma = getPrismaClient();
const gameRepository = new GameRepository(prisma);
const walletService = new WalletService(new WalletRepository(prisma));
const betService = new BetService(new BetRepository(prisma), walletService);
const roundService = new RoundService(gameRepository);
const betController = new BetController(betService);
const roundController = new RoundController(roundService);

gameRouter.get("/round/current", asyncHandler(roundController.current));
gameRouter.get("/round/config", asyncHandler(roundController.config));
gameRouter.get("/rounds/history", asyncHandler(roundController.history));
gameRouter.get("/bets/me", authGuard, asyncHandler(roundController.myBets));
gameRouter.post(
  "/bets",
  authGuard,
  validateBody(placeBetSchema),
  fraudBetGuard,
  asyncHandler(betController.placeBet),
);
