import type { Request, Response } from "express";

import type { UserService } from "./user.service.js";

export class UserController {
  constructor(private readonly userService: UserService) {}

  status = async (_req: Request, res: Response) => {
    const result = await this.userService.getStatus();
    res.status(200).json(result);
  };

  leaderboard = async (_req: Request, res: Response) => {
    const result = await this.userService.getLeaderboard();
    res.status(200).json(result);
  };
}
