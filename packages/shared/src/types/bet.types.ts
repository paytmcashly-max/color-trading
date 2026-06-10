import type { EntityId, ISODateString, PredictionColor, BetStatus } from "./game.types.js";
import type { WalletBalance } from "./wallet.types.js";

export const BETTING_OPTIONS = ["RED", "GREEN", "VIOLET"] as const;

export type BettingOption = (typeof BETTING_OPTIONS)[number];

export interface PlaceBetRequest {
  roundId: EntityId;
  selection: PredictionColor;
  amount: number;
  idempotencyKey: string;
}

export interface BetRecord {
  id: EntityId;
  userId: EntityId;
  roundId: EntityId;
  choice: PredictionColor;
  selection: PredictionColor;
  amount: string;
  coinsStaked: string;
  status: BetStatus;
  payoutAmount: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PlaceBetResponse {
  bet: BetRecord;
  wallet: WalletBalance;
  idempotentReplay?: boolean;
}

export interface BettingOptionsResponse {
  options: readonly BettingOption[];
}
