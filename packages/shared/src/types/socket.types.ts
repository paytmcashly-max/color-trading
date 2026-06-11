import type { PlaceBetRequest, PlaceBetResponse } from "./bet.types.js";
import type {
  EntityId,
  ISODateString,
  PredictionColor,
  RoundEngineStatus,
  RoundLifecycleStatus,
  RoundStatus,
} from "./game.types.js";
import type { WalletUpdateEvent } from "./wallet.types.js";

export interface JoinRoundRequest {
  roundId: EntityId;
}

export interface LeaveRoundRequest {
  roundId: EntityId;
}

export interface SocketRound {
  id: EntityId;
  roundNumber: string;
  status: RoundStatus | RoundLifecycleStatus;
  dbStatus?: RoundStatus;
  lifecycleStatus: RoundEngineStatus;
  engineStatus: RoundEngineStatus;
  result: PredictionColor | null;
  startTime: ISODateString;
  lockTime: ISODateString;
  endTime: ISODateString;
}

export interface RoundUpdateEvent {
  round: SocketRound | null;
  remainingSeconds: number;
  syncedAt: ISODateString;
}

export interface ResultDeclaredEvent extends RoundUpdateEvent {
  result: PredictionColor;
}

export interface RoundCancelledEvent extends RoundUpdateEvent {
  round: SocketRound;
  reason: string;
  actorId?: EntityId;
  refundedBetCount: number;
  refundedCoins: number;
}

export interface BetSettledEvent {
  betId: EntityId;
  id: EntityId;
  userId: EntityId;
  roundId: EntityId;
  status: "WON" | "LOST" | "CANCELLED";
  choice: PredictionColor;
  result: PredictionColor | null;
  stake: string;
  coinsStaked: string;
  payoutAmount: string;
  netProfitLoss: string;
  settledAt: ISODateString;
}

export interface SocketSuccessAck<TData = undefined> {
  ok: true;
  data?: TData;
}

export interface SocketErrorAck {
  ok: false;
  error: string;
  message?: string;
  details?: Record<string, string[] | undefined>;
}

export type SocketAck<TData = undefined> = SocketSuccessAck<TData> | SocketErrorAck;

export interface ClientToServerEventPayloads {
  join_round: JoinRoundRequest;
  leave_round: LeaveRoundRequest;
  place_bet: PlaceBetRequest;
}

export interface ServerToClientEventPayloads {
  round_update: RoundUpdateEvent;
  round_cancelled: RoundCancelledEvent;
  wallet_update: WalletUpdateEvent;
  result_declared: ResultDeclaredEvent;
  bet_settled: BetSettledEvent;
}

export type ClientToServerEventName = keyof ClientToServerEventPayloads;
export type ServerToClientEventName = keyof ServerToClientEventPayloads;

export type JoinRoundAck = SocketAck<{ room: string; snapshot: RoundUpdateEvent }>;
export type LeaveRoundAck = SocketAck<{ room: string }>;
export type PlaceBetAck = SocketAck<PlaceBetResponse>;
