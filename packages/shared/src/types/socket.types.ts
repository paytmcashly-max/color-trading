import type { PlaceBetRequest, PlaceBetResponse } from "./bet.types.js";
import type { EntityId, ISODateString, PredictionColor, RoundEngineStatus } from "./game.types.js";
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
  wallet_update: WalletUpdateEvent;
  result_declared: ResultDeclaredEvent;
}

export type ClientToServerEventName = keyof ClientToServerEventPayloads;
export type ServerToClientEventName = keyof ServerToClientEventPayloads;

export type JoinRoundAck = SocketAck<{ room: string; snapshot: RoundUpdateEvent }>;
export type LeaveRoundAck = SocketAck<{ room: string }>;
export type PlaceBetAck = SocketAck<PlaceBetResponse>;
