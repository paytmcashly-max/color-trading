import type { Request, Response } from "express";

import type { RoundService } from "../services/round.service.js";

export class RoundController {
  constructor(private readonly roundService: RoundService) {}

  current = async (_req: Request, res: Response) => {
    const result = await this.roundService.getCurrentRound();
    res.status(200).json(result);
  };

  history = async (_req: Request, res: Response) => {
    const result = await this.roundService.getRoundHistory();
    res.status(200).json(result);
  };

  myBets = async (req: Request, res: Response) => {
    const result = await this.roundService.getUserBetHistory(req.auth!.userId);
    res.status(200).json(result);
  };
}
