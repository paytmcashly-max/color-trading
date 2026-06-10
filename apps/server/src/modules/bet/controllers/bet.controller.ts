import type { Request, Response } from "express";

import { BETTING_OPTIONS } from "../dto/place-bet.dto.js";
import type { BetService } from "../services/bet.service.js";

export class BetController {
  constructor(private readonly betService: BetService) {}

  options = async (_req: Request, res: Response) => {
    res.status(200).json({
      options: BETTING_OPTIONS,
    });
  };

  placeBet = async (req: Request, res: Response) => {
    const result = await this.betService.placeBet(req.auth!.userId, req.body);
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  };

  mine = async (req: Request, res: Response) => {
    const result = await this.betService.getUserBets(req.auth!.userId);
    res.status(200).json(result);
  };
}
