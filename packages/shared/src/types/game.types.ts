export type EntityId = string;
export type ISODateString = string;

export type PredictionColor = "RED" | "GREEN" | "VIOLET";

export type UserRole = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export type RoundStatus = "INIT" | "OPEN" | "LOCKED" | "RESOLVING" | "COMPLETED" | "CANCELLED";

export type BetStatus = "PENDING" | "WON" | "LOST" | "CANCELLED";

export interface User {
  id: EntityId;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Wallet {
  id: EntityId;
  userId: EntityId;
  depositBalance: number;
  winningBalance: number;
  totalBalance: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface GameRound {
  id: EntityId;
  roundNumber: number;
  status: RoundStatus;
  resultColor: PredictionColor | null;
  startsAt: ISODateString;
  locksAt: ISODateString;
  endsAt: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Bet {
  id: EntityId;
  userId: EntityId;
  roundId: EntityId;
  color: PredictionColor;
  amountCoins: number;
  status: BetStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
