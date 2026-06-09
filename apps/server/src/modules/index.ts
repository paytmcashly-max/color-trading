import type { Express } from "express";

import { adminRouter } from "./admin/admin.routes.js";
import { authRouter } from "./auth/auth.routes.js";
import { gameRouter } from "./game/game.routes.js";
import { userRouter } from "./user/user.routes.js";
import { walletRouter } from "./wallet/wallet.routes.js";

export function registerModuleRoutes(app: Express) {
  registerRoutesAt(app, "");
  registerRoutesAt(app, "/api");
  registerRoutesAt(app, "/v1");
}

function registerRoutesAt(app: Express, prefix: string) {
  app.use(`${prefix}/auth`, authRouter);
  app.use(`${prefix}/admin`, adminRouter);
  app.use(`${prefix}/game`, gameRouter);
  app.use(`${prefix}/users`, userRouter);
  app.use(`${prefix}/wallet`, walletRouter);
}
