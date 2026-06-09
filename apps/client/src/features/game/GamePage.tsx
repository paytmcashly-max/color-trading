"use client";

import { motion } from "framer-motion";
import { Check, Loader2, Timer, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PredictionColor } from "@color-trading/shared";

import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentRound, fetchMyBetHistory, placePrediction } from "@/services/api-client";
import { getActiveSocket, placeBetOverSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import { useWallet } from "@/hooks/useWallet";
import type { BetDto, RoundDto } from "@/types/api";
import { formatCoinString } from "@/utils/format-coins";

const quickAmounts = [10, 50, 100, 500, 1000];

const choices: Array<{
  color: PredictionColor;
  label: string;
  surface: string;
  glow: string;
}> = [
  {
    color: "GREEN",
    label: "Green",
    surface: "from-[#dcfce7] to-[#bbf7d0]",
    glow: "shadow-[0_14px_28px_rgba(22,135,79,0.14)]",
  },
  {
    color: "RED",
    label: "Red",
    surface: "from-[#fee2e2] to-[#fecaca]",
    glow: "shadow-[0_14px_28px_rgba(201,42,42,0.12)]",
  },
  {
    color: "VIOLET",
    label: "Violet",
    surface: "from-[#ede9fe] to-[#ddd6fe]",
    glow: "shadow-[0_14px_28px_rgba(110,70,185,0.12)]",
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
  const userId = user?.id;

  const roundQuery = useQuery({ queryKey: ["current-round"], queryFn: fetchCurrentRound });
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
      <section className="min-h-[calc(100vh-176px)] rounded-3xl border border-line bg-white p-4 text-ink shadow-[0_18px_48px_rgba(23,32,26,0.10)]">
        <div className="grid gap-5 pb-28">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-muted">Round #{currentRound?.roundNumber ?? "--"}</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">{statusLabel(currentRound)}</h1>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${canPredict ? "bg-[#dff8e9] text-[#106b3d]" : "bg-[#fff3cd] text-[#8a5a00]"}`}>
              {canPredict ? "OPEN" : "LOCKED"}
            </span>
          </header>

          <CountdownRing remainingSeconds={timer} isOpen={canPredict} />

          {roundResult ? (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="rounded-3xl border border-line bg-[#f8faf7] p-4"
            >
              <p className="text-xs font-black uppercase text-muted">Result</p>
              <div className="mt-2 flex items-center justify-between">
                <strong className="text-2xl font-black">{roundResult}</strong>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${outcome === "WIN" ? "bg-[#dff8e9] text-[#106b3d]" : outcome === "LOSS" ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#eef1ef] text-muted"}`}>
                  {outcome}
                </span>
              </div>
            </motion.div>
          ) : null}

          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Choose color</h2>
              <span className="text-xs font-black uppercase text-muted">{hasBetForRound ? `Placed ${currentBet?.choice}` : "Tap to select"}</span>
            </div>
            <div className="grid gap-3">
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
                    className={`min-h-20 rounded-3xl border bg-gradient-to-br ${choice.surface} p-4 text-left text-ink transition disabled:opacity-45 ${
                      active ? `border-ink ring-4 ring-ink/10 ${choice.glow}` : "border-line"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span>
                        <span className="block text-2xl font-black">{choice.label}</span>
                        <span className="mt-1 block text-xs font-black uppercase text-muted">
                          {active ? "Selected" : "Prediction"}
                        </span>
                      </span>
                      {active ? (
                        <span className="grid size-12 place-items-center rounded-full bg-white text-ink shadow-sm">
                          <Check size={24} aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-lg font-black">Amount</h2>
            <div className="grid grid-cols-5 gap-2">
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
                  className={`min-h-12 rounded-2xl border text-sm font-black ${
                    amount === value
                      ? "border-[#16874f] bg-[#dff8e9] text-[#106b3d]"
                      : "border-line bg-[#f8faf7] text-muted"
                  }`}
                >
                  {value}
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
          </section>
        </div>

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

function CountdownRing({ remainingSeconds, isOpen }: { remainingSeconds: number; isOpen: boolean }) {
  const max = isOpen ? 45 : 15;
  const progress = Math.max(0, Math.min(1, remainingSeconds / max));
  const angle = Math.round(progress * 360);

  return (
    <div className="grid place-items-center py-2">
      <div
        className="grid size-56 place-items-center rounded-full p-3 shadow-[inset_0_0_28px_rgba(23,32,26,0.04),0_12px_32px_rgba(23,32,26,0.10)] sm:size-60"
        style={{
          background: `conic-gradient(${isOpen ? "#16874f" : "#ffc857"} ${angle}deg, #e8eee8 0deg)`,
        }}
      >
        <div className="grid size-full place-items-center rounded-full border border-line bg-white">
          <div className="text-center">
            <Timer className="mx-auto mb-2 text-muted" size={24} aria-hidden="true" />
            <p className="text-6xl font-black tabular-nums text-ink">{remainingSeconds > 0 ? remainingSeconds : "--"}</p>
            <p className="mt-1 text-xs font-black uppercase text-muted">seconds</p>
          </div>
        </div>
      </div>
    </div>
  );
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
