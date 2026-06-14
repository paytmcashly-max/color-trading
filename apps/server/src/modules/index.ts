import type { Express } from "express";

import { API_PREFIX } from "../common/http/api-prefix.js";
import { adminRouter } from "./admin/admin.routes.js";
import { authRouter } from "./auth/auth.routes.js";
import { betRouter } from "./bet/bet.routes.js";
import { gameRouter } from "./game/game.routes.js";
import { userRouter } from "./user/user.routes.js";
import { walletRouter } from "./wallet/wallet.routes.js";
import { internalPaymentEventsRouter, paymentRouter } from "./payments/payment.routes.js";
import { realMoneyRouter } from "./real-money/real-money.routes.js";
import { realMoneyAdminRouter } from "./real-money/real-money-admin.routes.js";

export function registerModuleRoutes(app: Express) {
  registerRoutesAt(app, API_PREFIX);
}

function registerRoutesAt(app: Express, prefix: string) {
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/bets`, betRouter);
  app.use(`${prefix}/admin`, adminRouter);
  app.use(`${prefix}/admin/real-money`, realMoneyAdminRouter);
  app.use(`${prefix}/game`, gameRouter);
  app.use(`${prefix}/users`, userRouter);
  app.use(`${prefix}/wallet`, walletRouter);
  app.use(`${prefix}/payments`, paymentRouter);
  app.use(`${prefix}/internal/payment-events`, internalPaymentEventsRouter);
  app.use(`${prefix}/real-money`, realMoneyRouter);
}
