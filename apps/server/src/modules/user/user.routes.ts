import { Router } from "express";

import { asyncHandler } from "../../common/middleware/async-handler.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { UserController } from "./user.controller.js";
import { UserService } from "./user.service.js";

export const userRouter = Router();

const userService = new UserService(getPrismaClient());
const userController = new UserController(userService);

userRouter.get("/status", asyncHandler(userController.status));
userRouter.get("/leaderboard", asyncHandler(userController.leaderboard));
