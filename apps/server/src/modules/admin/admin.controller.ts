import type { Request, Response } from "express";

import { HttpError } from "../../common/errors/http-error.js";
import type { AdminService } from "./admin.service.js";

export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  dashboard = async (_req: Request, res: Response) => {
    const result = await this.adminService.getDashboardStats();
    res.status(200).json(result);
  };

  users = async (req: Request, res: Response) => {
    const users = await this.adminService.listUsers(readStringQuery(req.query.q));
    res.status(200).json(users);
  };

  banUser = async (req: Request, res: Response) => {
    const result = await this.adminService.banUser(req.auth!.userId, readParam(req, "id"));
    res.status(200).json(result);
  };

  unbanUser = async (req: Request, res: Response) => {
    const result = await this.adminService.unbanUser(req.auth!.userId, readParam(req, "id"));
    res.status(200).json(result);
  };

  rounds = async (_req: Request, res: Response) => {
    const result = await this.adminService.listRounds();
    res.status(200).json(result);
  };

  activeRound = async (_req: Request, res: Response) => {
    const result = await this.adminService.getActiveRound();
    res.status(200).json(result);
  };

  forceStartRound = async (req: Request, res: Response) => {
    const result = await this.adminService.forceStartRound(req.auth!.userId, req.body);
    res.status(201).json(result);
  };

  forceStopRound = async (req: Request, res: Response) => {
    const result = await this.adminService.forceStopRound(req.auth!.userId, req.body);
    res.status(200).json(result);
  };

  forceResult = async (req: Request, res: Response) => {
    const result = await this.adminService.forceResult(req.auth!.userId, req.body);
    res.status(200).json(result);
  };

  gameControl = async (_req: Request, res: Response) => {
    const result = await this.adminService.getGameControl();
    res.status(200).json(result);
  };

  pauseGame = async (req: Request, res: Response) => {
    const result = await this.adminService.pauseGame(req.auth!.userId, req.body);
    res.status(200).json(result);
  };

  resumeGame = async (req: Request, res: Response) => {
    const result = await this.adminService.resumeGame(req.auth!.userId, req.body);
    res.status(200).json(result);
  };

  wallet = async (req: Request, res: Response) => {
    const result = await this.adminService.getWallet(readParam(req, "userId"));
    res.status(200).json(result);
  };

  ledger = async (req: Request, res: Response) => {
    const result = await this.adminService.getLedger(readParam(req, "userId"));
    res.status(200).json(result);
  };

  adjustWallet = async (req: Request, res: Response) => {
    const result = await this.adminService.adjustWallet(req.auth!.userId, readParam(req, "userId"), req.body);
    res.status(201).json(result);
  };

  bets = async (req: Request, res: Response) => {
    const result = await this.adminService.listBets({
      roundId: readStringQuery(req.query.roundId),
      userId: readStringQuery(req.query.userId),
    });
    res.status(200).json(result);
  };

  systemHealth = async (_req: Request, res: Response) => {
    const result = await this.adminService.getSystemHealth();
    res.status(200).json(result);
  };

  auditLogs = async (_req: Request, res: Response) => {
    const result = await this.adminService.listAuditLogs();
    res.status(200).json(result);
  };

  fraudLogs = async (_req: Request, res: Response) => {
    const result = await this.adminService.listFraudLogs();
    res.status(200).json(result);
  };

  riskProfiles = async (_req: Request, res: Response) => {
    const result = await this.adminService.listRiskProfiles();
    res.status(200).json(result);
  };
}

function readParam(req: Request, key: string) {
  const value = req.params[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "ROUTE_PARAM_REQUIRED", `${key} route parameter is required.`);
  }

  return value;
}

function readStringQuery(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
