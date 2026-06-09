import type { Request, Response } from "express";

import type { RoundService } from "../services/round.service.js";

export class RoundController {
  constructor(private readonly roundService: RoundService) {}

  current = async (_req: Request, res: Response) => {
    const result = await this.roundService.getCurrentRound();
    res.status(200).json(result);
  };
}
