"use client";

import { motion } from "framer-motion";
import { Check, Loader2, ShieldCheck, Timer, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PredictionColor } from "@color-trading/shared";

import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentRound, fetchMyBetHistory, fetchRoundHistory, placePrediction } from "@/services/api-client";
import { getActiveSocket, placeBetOverSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import { useWallet } from "@/hooks/useWallet";
import type { BetDto, RoundDto, RoundHistoryDto, UserBetHistoryDto } from "@/types/api";
import { formatCoinString } from "@/utils/format-coins";

const quickAmounts = [10, 50, 100, 200, 500, 1000];

const choices: Array<{
  color: PredictionColor;
  label: string;
  surface: string;
  glow: string;
  ratio: string;
}> = [
  {
    color: "GREEN",
    label: "Green",
    surface: "from-[#dcfce7] to-[#bbf7d0]",
    glow: "shadow-[0_14px_28px_rgba(22,135,79,0.14)]",
    ratio: "1:2",
  },
  {
    color: "VIOLET",
    label: "Violet",
    surface: "from-[#ede9fe] to-[#ddd6fe]",
    glow: "shadow-[0_14px_28px_rgba(110,70,185,0.12)]",
    ratio: "1:4.5",
  },
  {
    color: "RED",
    label: "Red",
    surface: "from-[#fee2e2] to-[#fecaca]",
    glow: "shadow-[0_14px_28px_rgba(201,42,42,0.12)]",
    ratio: "1:2",
  },
];

export function GamePage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const user = useAuthStore((state) => state.user);
  const currentRound = useGameStore((state) => state.currentRound);
  const timer = useGameStore((state) => state.timerRemainingSeconds);
  const activeBets = useGameStore((state) => state.activeBets);
  const lastResult = useGameStore((state) => state.lastResult);
  const setRound = useGameStore((state) => state.setRound);
  const setWallet = useGameStore((state) => state.setWallet);
  const addBet = useGameStore((state) => state.addBet);
  const { wallet } = useWallet();
  const [selected, setSelected] = useState<PredictionColor | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [amount, setAmount] = useState(50);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ordersTab, setOrdersTab] = useState<"everyone" | "mine">("everyone");
  const userId = user?.id;

  const roundQuery = useQuery({ queryKey: ["current-round"], queryFn: fetchCurrentRound });
  const roundHistoryQuery = useQuery({
    queryKey: ["round-history", "game"],
    queryFn: fetchRoundHistory,
    refetchInterval: 20_000,
  });
  const myBetsQuery = useQuery({
    queryKey: ["my-bet-history"],
    queryFn: () => fetchMyBetHistory(token!),
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (roundQuery.data) {
      setRound(roundQuery.data.round);
    }
  }, [roundQuery.data, setRound]);

  const selectedForRound = selectedRoundId === currentRound?.id ? selected : null;
  const canPredict =
    Boolean(token) &&
    Boolean(currentRound) &&
    (currentRound?.status === "OPEN" || currentRound?.phase === "BETTING_OPEN");
  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const amountInvalid = safeAmount <= 0 || safeAmount > totalBalance;
  const currentBet = useMemo(() => {
    if (!userId || !currentRound) {
      return null;
    }

    return (
      activeBets.find((bet) => bet.userId === userId && bet.roundId === currentRound.id) ??
      myBetsQuery.data?.bets.find((bet) => bet.roundId === currentRound.id) ??
      null
    );
  }, [activeBets, currentRound, myBetsQuery.data?.bets, userId]);
  const hasBetForRound = Boolean(currentBet);
  const roundResult = currentRound?.result ?? lastResult;
  const outcome = getOutcome(roundResult, currentBet);
  const roundHistory = roundHistoryQuery.data?.rounds ?? [];
  const latestBets = activeBets.slice(0, 8);
  const myBets = myBetsQuery.data?.bets.slice(0, 8) ?? [];

  const mutation = useMutation({
    mutationFn: (choice: PredictionColor) => {
      const idempotencyKey = `ui:${currentRound!.id}:${choice}:${Date.now()}`;
      const input = {
        roundId: currentRound!.id,
        choice,
        coinsStaked: amount,
        idempotencyKey,
      };

      return getActiveSocket() ? placeBetOverSocket(input) : placePrediction(token!, input);
    },
    onSuccess: (response) => {
      addBet(response.bet);
      if (response.wallet) {
        setWallet(response.wallet);
      }
      setConfirming(false);
      setNotice(`${response.bet.choice} prediction placed`);
    },
    onError: (error) => {
      setConfirming(false);
      setNotice(error.message);
    },
  });

  const actionDisabled = !canPredict || !selectedForRound || amountInvalid || mutation.isPending || hasBetForRound;

  return (
    <AppShell title="Color Prediction">
      <section className="grid gap-4 pb-28">
        <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black text-muted">Period</p>
              <h1 className="mt-1 truncate text-2xl font-black tabular-nums text-ink">
                {currentRound?.roundNumber ?? "--"}
              </h1>
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase ${canPredict ? "bg-[#dff8e9] text-[#106b3d]" : "bg-[#fff3cd] text-[#8a5a00]"}`}>
                {statusLabel(currentRound)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-muted">Count Down</p>
              <CountdownBoxes remainingSeconds={timer} />
            </div>
          </div>
        </section>

        <section className="grid gap-2">
          <div className="grid grid-cols-3 gap-2">
              {choices.map((choice) => {
                const active = selectedForRound === choice.color;
                return (
                  <motion.button
                    key={choice.color}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    disabled={!canPredict || hasBetForRound}
                    onClick={() => {
                      setSelected(choice.color);
                      setSelectedRoundId(currentRound?.id ?? null);
                      setConfirming(false);
                    }}
                    className={`min-h-24 rounded-2xl border bg-gradient-to-br ${choice.surface} p-3 text-center text-ink transition disabled:opacity-45 ${
                      active ? `border-ink ring-4 ring-ink/10 ${choice.glow}` : "border-line"
                    }`}
                  >
                    <span className="grid justify-items-center gap-1">
                      <ShieldCheck size={20} aria-hidden="true" />
                      <span className="text-xs font-black uppercase">Join {choice.label}</span>
                      <span className="text-[11px] font-black text-muted">{choice.ratio}</span>
                      {active ? (
                        <span className="mt-1 grid size-7 place-items-center rounded-full bg-white text-ink shadow-sm">
                          <Check size={16} aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          <p className="text-center text-xs font-black text-muted">
            {hasBetForRound ? `Prediction locked: ${currentBet?.choice}` : "Choose one color before countdown closes"}
          </p>
        </section>

        <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-black">Coins</h2>
            <p className="text-xs font-black text-muted">Balance {formatCoinString(wallet?.totalBalance)}</p>
          </div>
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map((value) => (
                <motion.button
                  key={value}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  disabled={!canPredict || hasBetForRound}
                  onClick={() => {
                    setAmount(value);
                    setConfirming(false);
                  }}
                  className={`min-h-11 rounded-xl border text-sm font-black ${
                    amount === value
                      ? "border-[#16874f] bg-[#dff8e9] text-[#106b3d]"
                      : "border-line bg-[#f8faf7] text-muted"
                  }`}
                >
                  {formatCoinString(value)}
                </motion.button>
              ))}
            </div>
            <input
              className="min-h-14 rounded-2xl border border-line bg-white px-4 text-xl font-black text-ink outline-none focus:border-[#16874f]"
              type="number"
              min={1}
              inputMode="numeric"
              value={Number.isFinite(amount) ? amount : ""}
              onChange={(event) => {
                setAmount(Number(event.target.value));
                setConfirming(false);
              }}
              aria-label="Custom amount"
            />
          </div>
        </section>

        <RecordPanel rounds={roundHistory} currentResult={roundResult} outcome={outcome} />
        <OrdersPanel
          tab={ordersTab}
          onTabChange={setOrdersTab}
          everyoneBets={latestBets}
          myBets={myBets}
        />

        <div className="fixed inset-x-0 bottom-[82px] z-20 px-4 md:sticky md:bottom-4 md:px-0">
          <div className="mx-auto max-w-5xl rounded-3xl border border-line bg-white/96 p-3 shadow-[0_-10px_30px_rgba(23,32,26,0.12)] backdrop-blur">
            {confirming && selectedForRound ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-2xl bg-[#f8faf7] px-4 py-3">
                  <span className="font-black">{selectedForRound}</span>
                  <span className="font-black">{formatCoinString(safeAmount)} coins</span>
                </div>
                <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
                  <button
                    type="button"
                    className="min-h-14 rounded-2xl border border-line bg-white text-sm font-black text-ink"
                    disabled={mutation.isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="min-h-14 rounded-2xl bg-ink text-sm font-black text-white shadow-[0_12px_28px_rgba(23,32,26,0.18)] disabled:opacity-45"
                    disabled={actionDisabled}
                    onClick={() => mutation.mutate(selectedForRound)}
                  >
                    {mutation.isPending ? <Loader2 className="mx-auto animate-spin" size={22} aria-hidden="true" /> : "Confirm"}
                  </button>
                </div>
              </div>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-base font-black text-white shadow-[0_12px_28px_rgba(23,32,26,0.18)] disabled:opacity-45"
                disabled={actionDisabled}
                onClick={() => setConfirming(true)}
              >
                {mutation.isPending ? <Loader2 className="animate-spin" size={22} aria-hidden="true" /> : <Zap size={22} aria-hidden="true" />}
                {hasBetForRound ? "Prediction Locked" : selectedForRound ? `Place ${selectedForRound}` : "Place Prediction"}
              </motion.button>
            )}
            {notice ? (
              <p className={`mt-2 rounded-2xl px-3 py-2 text-center text-xs font-black ${mutation.isError ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#dff8e9] text-[#106b3d]"}`}>
                {notice}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function CountdownBoxes({ remainingSeconds }: { remainingSeconds: number }) {
  const safe = Math.max(0, remainingSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  const digits = `${minutes.toString().padStart(2, "0")}${seconds.toString().padStart(2, "0")}`.split("");

  return (
    <div className="mt-2 flex items-center justify-end gap-1">
      <Timer size={16} className="mr-1 text-muted" aria-hidden="true" />
      {digits.map((digit, index) => (
        <span
          key={`${digit}-${index}`}
          className="grid size-8 place-items-center rounded-md bg-[#eef3ee] text-lg font-black tabular-nums text-ink"
        >
          {digit}
        </span>
      ))}
    </div>
  );
}

function RecordPanel({
  rounds,
  currentResult,
  outcome,
}: {
  rounds: RoundHistoryDto[];
  currentResult: string | null | undefined;
  outcome: "WIN" | "LOSS" | "WAITING";
}) {
  const displayRounds = rounds.slice(0, 15);

  return (
    <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
      <div className="flex items-center justify-between">
        <h2 className="font-black">Record</h2>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${outcome === "WIN" ? "bg-[#dff8e9] text-[#106b3d]" : outcome === "LOSS" ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#eef1ef] text-muted"}`}>
          {currentResult ? `Last ${currentResult}` : "Waiting"}
        </span>
      </div>
      {displayRounds.length === 0 ? (
        <p className="mt-3 text-sm font-bold text-muted">Round results will appear here.</p>
      ) : (
        <div className="mt-4 grid grid-cols-5 gap-3">
          {displayRounds.map((round) => (
            <div key={round.id} className="grid justify-items-center gap-1">
              <ResultDot result={round.result} />
              <span className="text-[10px] font-bold text-muted">{round.roundNumber.slice(-3)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OrdersPanel({
  tab,
  onTabChange,
  everyoneBets,
  myBets,
}: {
  tab: "everyone" | "mine";
  onTabChange: (tab: "everyone" | "mine") => void;
  everyoneBets: BetDto[];
  myBets: UserBetHistoryDto[];
}) {
  const rows = tab === "everyone" ? everyoneBets : myBets;

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
      <div className="grid grid-cols-2 border-b border-line text-sm font-black">
        <button
          type="button"
          className={`min-h-12 ${tab === "everyone" ? "border-b-2 border-[#16874f] text-ink" : "text-muted"}`}
          onClick={() => onTabChange("everyone")}
        >
          Everyone&apos;s Order
        </button>
        <button
          type="button"
          className={`min-h-12 ${tab === "mine" ? "border-b-2 border-[#16874f] text-ink" : "text-muted"}`}
          onClick={() => onTabChange("mine")}
        >
          My Order
        </button>
      </div>
      <div className="grid grid-cols-[1fr_0.8fr_0.7fr] gap-2 px-4 py-3 text-[11px] font-black uppercase text-muted">
        <span>{tab === "everyone" ? "User" : "Period"}</span>
        <span>Select</span>
        <span className="text-right">Point</span>
      </div>
      <div className="grid gap-1 px-4 pb-4">
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-[#f8faf7] px-3 py-4 text-center text-sm font-bold text-muted">
            {tab === "everyone" ? "Live orders will appear here." : "Your orders will appear here."}
          </p>
        ) : (
          rows.map((bet) => (
            <div key={bet.id} className="grid grid-cols-[1fr_0.8fr_0.7fr] items-center gap-2 rounded-2xl bg-[#f8faf7] px-3 py-2 text-sm font-bold">
              <span className="truncate text-muted">
                {tab === "everyone" ? maskUser(bet.userId) : getBetPeriodLabel(bet)}
              </span>
              <span className="flex items-center gap-2">
                <ResultDot result={bet.choice} small />
                {bet.choice.slice(0, 1)}
              </span>
              <span className="truncate text-right text-ink">{formatCoinString(bet.coinsStaked)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ResultDot({ result, small = false }: { result: string | null | undefined; small?: boolean }) {
  const className =
    result === "GREEN"
      ? "bg-[#16a34a]"
      : result === "RED"
        ? "bg-[#ef4444]"
        : result === "VIOLET"
          ? "bg-[#8b5cf6]"
          : "bg-[#dfe6df] text-muted";

  return (
    <span className={`grid ${small ? "size-7 text-[10px]" : "size-9 text-xs"} place-items-center rounded-full ${className} font-black text-white shadow-sm`}>
      {result?.slice(0, 1) ?? "--"}
    </span>
  );
}

function maskUser(userId: string) {
  return `***${userId.slice(-4).toUpperCase()}`;
}

function getBetPeriodLabel(bet: BetDto | UserBetHistoryDto) {
  return `#${"round" in bet && bet.round?.roundNumber ? bet.round.roundNumber : bet.roundId.slice(0, 6)}`;
}

function getOutcome(
  result: string | null | undefined,
  bet: Pick<BetDto, "choice"> | null,
): "WIN" | "LOSS" | "WAITING" {
  if (!result || !bet) {
    return "WAITING";
  }

  return bet.choice === result ? "WIN" : "LOSS";
}

function statusLabel(round: RoundDto | null) {
  if (!round) {
    return "Syncing round";
  }

  if (round.result || round.phase === "RESULT_DECLARED") {
    return "Result declared";
  }

  if (round.status === "OPEN" || round.phase === "BETTING_OPEN") {
    return "Live round";
  }

  return "Betting locked";
}
