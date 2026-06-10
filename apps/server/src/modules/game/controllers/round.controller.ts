import type { Request, Response } from "express";

import { readPagination } from "../../../common/utils/pagination.js";
import type { RoundService } from "../services/round.service.js";

export class RoundController {
  constructor(private readonly roundService: RoundService) {}

  current = async (_req: Request, res: Response) => {
    const result = await this.roundService.getCurrentRound();
    res.status(200).json(result);
  };

  config = async (_req: Request, res: Response) => {
    const result = this.roundService.getRoundConfig();
    res.status(200).json(result);
  };

  history = async (req: Request, res: Response) => {
    const result = await this.roundService.getRoundHistory(readPagination(req, 30));
    res.status(200).json(result);
  };

  myBets = async (req: Request, res: Response) => {
    const result = await this.roundService.getUserBetHistory(req.auth!.userId, readPagination(req));
    res.status(200).json(result);
  };
}
