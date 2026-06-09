"use client";

import { create } from "zustand";

import type { BetDto, RoundDto, WalletDto } from "@/types/api";

type EventName =
  | "system:sync"
  | "round:created"
  | "round:state"
  | "round:timer"
  | "round:lock"
  | "round:locked"
  | "round:result"
  | "round:completed"
  | "bet:placed"
  | "wallet:update"
  | "user:balance_sync"
  | "system:error";

interface GameState {
  socketConnected: boolean;
  currentRound: RoundDto | null;
  wallet: WalletDto | null;
  activeBets: BetDto[];
  timerRemainingSeconds: number;
  lastResult: string | null;
  lastError: string | null;
  setSocketConnected: (connected: boolean) => void;
  setRound: (round: RoundDto | null) => void;
  setWallet: (wallet: WalletDto | null) => void;
  addBet: (bet: BetDto) => void;
  applyRealtimeEvent: (name: EventName, payload: unknown) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  socketConnected: false,
  currentRound: null,
  wallet: null,
  activeBets: [],
  timerRemainingSeconds: 0,
  lastResult: null,
  lastError: null,
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setRound: (round) => set({ currentRound: round }),
  setWallet: (wallet) => set({ wallet }),
  addBet: (bet) => set({ activeBets: upsertBet(get().activeBets, bet) }),
  applyRealtimeEvent: (name, payload) => {
    if (name === "system:sync" && isRecord(payload)) {
      set({
        currentRound: isRound(payload.currentRound) ? payload.currentRound : get().currentRound,
        wallet: isWallet(payload.wallet) ? payload.wallet : get().wallet,
      });
      return;
    }

    if (
      (name === "round:created" ||
        name === "round:state" ||
        name === "round:lock" ||
        name === "round:locked" ||
        name === "round:completed") &&
      isRecord(payload) &&
      isRound(payload.round)
    ) {
      set({ currentRound: payload.round });
      if (typeof payload.remainingSeconds === "number") {
        set({ timerRemainingSeconds: payload.remainingSeconds });
      }
      return;
    }

    if (name === "round:timer" && isRecord(payload)) {
      set({
        timerRemainingSeconds:
          typeof payload.remainingSeconds === "number"
            ? payload.remainingSeconds
            : get().timerRemainingSeconds,
      });
      return;
    }

    if (name === "round:result" && isRecord(payload) && isRound(payload.round)) {
      set({ currentRound: payload.round, lastResult: payload.round.result });
      return;
    }

    if (name === "bet:placed" && isRecord(payload) && isBet(payload.bet)) {
      set({ activeBets: upsertBet(get().activeBets, payload.bet) });
      return;
    }

    if ((name === "wallet:update" || name === "user:balance_sync") && isRecord(payload) && isWallet(payload.wallet)) {
      set({ wallet: payload.wallet });
      return;
    }

    if (name === "system:error" && isRecord(payload)) {
      set({ lastError: typeof payload.message === "string" ? payload.message : "Realtime sync issue" });
    }
  },
}));

function upsertBet(bets: BetDto[], bet: BetDto) {
  const existing = bets.some((item) => item.id === bet.id);
  return existing ? bets.map((item) => (item.id === bet.id ? bet : item)) : [bet, ...bets].slice(0, 20);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRound(value: unknown): value is RoundDto {
  return isRecord(value) && typeof value.id === "string" && typeof value.status === "string";
}

function isWallet(value: unknown): value is WalletDto {
  return isRecord(value) && typeof value.totalBalance === "string";
}

function isBet(value: unknown): value is BetDto {
  return isRecord(value) && typeof value.id === "string" && typeof value.choice === "string";
}
