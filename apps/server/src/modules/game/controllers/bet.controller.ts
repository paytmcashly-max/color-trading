import type { Request, Response } from "express";

import type { BetService } from "../services/bet.service.js";

export class BetController {
  constructor(private readonly betService: BetService) {}

  placeBet = async (req: Request, res: Response) => {
    const result = await this.betService.placeBet(req.auth!.userId, req.body);
    res.status(201).json(result);
  };
}
