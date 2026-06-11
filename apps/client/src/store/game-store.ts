"use client";

import { create } from "zustand";

import type { BetDto, RoundDto, WalletDto } from "@/types/api";

type EventName =
  | "system:sync"
  | "round:created"
  | "round:update"
  | "round:state"
  | "round:timer"
  | "round:lock"
  | "round:locked"
  | "round:result"
  | "round:completed"
  | "round:cancelled"
  | "bet:placed"
  | "bet:settled"
  | "wallet:update"
  | "user:balance_sync"
  | "system:health"
  | "system:error";

interface GameState {
  socketConnected: boolean;
  currentRound: RoundDto | null;
  wallet: WalletDto | null;
  activeBets: BetDto[];
  liveActivity: string[];
  recentResults: Array<Pick<RoundDto, "id" | "roundNumber" | "result">>;
  timerRemainingSeconds: number;
  lastResult: string | null;
  lastCancellation: { roundId: string; reason: string | null } | null;
  settlementNotice: BetDto | null;
  shownSettlementIds: string[];
  lastError: string | null;
  lastSocketHealthAt: string | null;
  setSocketConnected: (connected: boolean) => void;
  setRound: (round: RoundDto | null) => void;
  setWallet: (wallet: WalletDto | null) => void;
  addBet: (bet: BetDto) => void;
  markSettlementShown: (betId: string) => void;
  dismissSettlementNotice: () => void;
  applyRealtimeEvent: (name: EventName, payload: unknown) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  socketConnected: false,
  currentRound: null,
  wallet: null,
  activeBets: [],
  liveActivity: [],
  recentResults: [],
  timerRemainingSeconds: 0,
  lastResult: null,
  lastCancellation: null,
  settlementNotice: null,
  shownSettlementIds: [],
  lastError: null,
  lastSocketHealthAt: null,
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setRound: (round) => set({ currentRound: round }),
  setWallet: (wallet) => set({ wallet }),
  addBet: (bet) => set({ activeBets: upsertBet(get().activeBets, bet) }),
  markSettlementShown: (betId) =>
    set({ shownSettlementIds: [betId, ...get().shownSettlementIds].slice(0, 100) }),
  dismissSettlementNotice: () => set({ settlementNotice: null }),
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
        name === "round:update" ||
        name === "round:state" ||
        name === "round:lock" ||
        name === "round:locked" ||
        name === "round:completed" ||
        name === "round:cancelled") &&
      isRecord(payload) &&
      isRound(payload.round)
    ) {
      const cancelled = isCancelledRound(payload.round);
      set({
        currentRound: payload.round,
        lastResult: cancelled ? null : get().lastResult,
        lastCancellation: cancelled
          ? {
              roundId: payload.round.id,
              reason: typeof payload.reason === "string" ? payload.reason : null,
            }
          : name === "round:created"
            ? null
            : get().lastCancellation,
      });
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
      set({
        currentRound: payload.round,
        lastResult: payload.round.result,
        lastCancellation: null,
        recentResults: prependResult(get().recentResults, payload.round),
      });
      return;
    }

    if (
      (name === "bet:placed" || name === "bet:settled") &&
      isRecord(payload) &&
      (isBet(payload.bet) || isBet(payload))
    ) {
      const bet = extractBet(payload);
      if (!bet) {
        return;
      }
      const alreadyShown = get().shownSettlementIds.includes(bet.id);
      set({
        activeBets: upsertBet(get().activeBets, bet),
        liveActivity: prependActivity(get().liveActivity, formatBetActivity(name, bet)),
        settlementNotice: name === "bet:settled" && !alreadyShown ? bet : get().settlementNotice,
        shownSettlementIds:
          name === "bet:settled" && !alreadyShown
            ? [bet.id, ...get().shownSettlementIds].slice(0, 100)
            : get().shownSettlementIds,
      });
      return;
    }

    if ((name === "wallet:update" || name === "user:balance_sync") && isRecord(payload) && isWallet(payload.wallet)) {
      set({ wallet: payload.wallet });
      return;
    }

    if (name === "system:error" && isRecord(payload)) {
      set({ lastError: typeof payload.message === "string" ? payload.message : "Realtime sync issue" });
      return;
    }

    if (name === "system:health" && isRecord(payload)) {
      set({
        socketConnected: true,
        lastSocketHealthAt:
          typeof payload.timestamp === "string" ? payload.timestamp : new Date().toISOString(),
      });
    }
  },
}));

function upsertBet(bets: BetDto[], bet: BetDto) {
  const existing = bets.some((item) => item.id === bet.id);
  return existing ? bets.map((item) => (item.id === bet.id ? bet : item)) : [bet, ...bets].slice(0, 20);
}

function prependActivity(activity: string[], item: string | null) {
  return item ? [item, ...activity].slice(0, 12) : activity;
}

function prependResult(
  results: Array<Pick<RoundDto, "id" | "roundNumber" | "result">>,
  round: RoundDto,
) {
  if (!round.result) {
    return results;
  }

  const next = {
    id: round.id,
    roundNumber: round.roundNumber,
    result: round.result,
  };

  return [next, ...results.filter((item) => item.id !== round.id)].slice(0, 20);
}

function formatBetActivity(name: EventName, bet: BetDto) {
  const player = maskUser(bet.userId);
  const amount = formatAmount(bet.coinsStaked ?? bet.amount);

  if (name === "bet:settled" && bet.status === "WON") {
    const payout = formatAmount(bet.payoutAmount);
    return `${player} won ${payout} on ${bet.choice}`;
  }

  if (name === "bet:placed") {
    return `${player} placed ${amount} on ${bet.choice}`;
  }

  return null;
}

function maskUser(userId: string) {
  return `Player***${userId.slice(-3).toUpperCase()}`;
}

function formatAmount(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "coins";
  }

  return `${amount.toLocaleString()} coins`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRound(value: unknown): value is RoundDto {
  return isRecord(value) && typeof value.id === "string" && typeof value.status === "string";
}

function isCancelledRound(round: RoundDto) {
  return round.dbStatus === "CANCELLED" || round.status === "CANCELLED";
}

function isWallet(value: unknown): value is WalletDto {
  return isRecord(value) && typeof value.totalBalance === "string";
}

function isBet(value: unknown): value is BetDto {
  return isRecord(value) && typeof value.id === "string" && typeof value.choice === "string";
}

function extractBet(payload: Record<string, unknown>): BetDto | null {
  if (isBet(payload.bet)) {
    return payload.bet;
  }

  return isBet(payload) ? payload : null;
}
