import { CoinLedgerDirection } from "@prisma/client";
import type { Request, Response } from "express";

import { HttpError } from "../../common/errors/http-error.js";
import type { WalletService } from "./wallet.service.js";

export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  balance = async (req: Request, res: Response) => {
    const result = await this.walletService.getWalletBalance(req.auth!.userId);
    res.status(200).json(result);
  };

  history = async (req: Request, res: Response) => {
    const result = await this.walletService.getLedgerHistory(req.auth!.userId);
    res.status(200).json(result);
  };

  transactions = async (req: Request, res: Response) => {
    const result = await this.walletService.getTransactionHistory(req.auth!.userId);
    res.status(200).json(result);
  };

  bonusCredit = async (req: Request, res: Response) => {
    const result = await this.walletService.creditCoins({
      userId: req.auth!.userId,
      amountCoins: req.body.amountCoins,
      referenceId: req.body.referenceId,
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json(result);
  };

  betDebit = async (req: Request, res: Response) => {
    const result = await this.walletService.debitCoins({
      userId: req.auth!.userId,
      amountCoins: req.body.amountCoins,
      referenceId: req.body.referenceId,
      idempotencyKey: req.body.idempotencyKey,
    });
    res.status(201).json(result);
  };

  adminAdjustment = async (req: Request, res: Response) => {
    const userId = req.params.userId;

    if (typeof userId !== "string") {
      throw new HttpError(400, "USER_ID_REQUIRED", "User id route parameter is required.");
    }

    const result = await this.walletService.adminAdjustCoins({
      userId,
      amountCoins: req.body.amountCoins,
      referenceId: req.body.referenceId,
      idempotencyKey: req.body.idempotencyKey,
      direction: req.body.direction as CoinLedgerDirection,
    });
    res.status(201).json(result);
  };
}
