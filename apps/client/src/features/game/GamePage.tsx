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
    surface: "from-[#19d879] to-[#0d7a49]",
    glow: "shadow-[0_0_38px_rgba(25,216,121,0.34)]",
  },
  {
    color: "RED",
    label: "Red",
    surface: "from-[#ff3b4f] to-[#9f1239]",
    glow: "shadow-[0_0_38px_rgba(255,59,79,0.30)]",
  },
  {
    color: "VIOLET",
    label: "Violet",
    surface: "from-[#9b5cff] to-[#5b21b6]",
    glow: "shadow-[0_0_38px_rgba(155,92,255,0.34)]",
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
      <section className="relative min-h-[calc(100vh-176px)] overflow-hidden rounded-[34px] border border-white/10 bg-[#0b0f1d] p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.46)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(31,216,122,0.22),transparent_34%),radial-gradient(circle_at_100%_40%,rgba(139,92,246,0.18),transparent_30%)]" />

        <div className="relative grid gap-5 pb-28">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-white/42">Round #{currentRound?.roundNumber ?? "--"}</p>
              <h1 className="mt-1 text-3xl font-black">{statusLabel(currentRound)}</h1>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${canPredict ? "bg-[#1fd87a]/18 text-[#83ffc3]" : "bg-[#ffc857]/15 text-[#ffd477]"}`}>
              {canPredict ? "OPEN" : "LOCKED"}
            </span>
          </header>

          <CountdownRing remainingSeconds={timer} isOpen={canPredict} />

          {roundResult ? (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="rounded-[28px] border border-white/10 bg-white/[0.07] p-4 backdrop-blur-xl"
            >
              <p className="text-xs font-black uppercase text-white/42">Result</p>
              <div className="mt-2 flex items-center justify-between">
                <strong className="text-2xl font-black">{roundResult}</strong>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${outcome === "WIN" ? "bg-[#1fd87a]/18 text-[#83ffc3]" : outcome === "LOSS" ? "bg-[#ff3b4f]/18 text-[#ff98a4]" : "bg-white/10 text-white/58"}`}>
                  {outcome}
                </span>
              </div>
            </motion.div>
          ) : null}

          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Choose color</h2>
              <span className="text-xs font-black uppercase text-white/42">{hasBetForRound ? `Placed ${currentBet?.choice}` : "Tap to select"}</span>
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
                    className={`min-h-24 rounded-[28px] border bg-gradient-to-br ${choice.surface} p-4 text-left transition disabled:opacity-45 ${
                      active ? `border-white/70 ring-4 ring-white/15 ${choice.glow}` : "border-white/10"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span>
                        <span className="block text-2xl font-black">{choice.label}</span>
                        <span className="mt-1 block text-xs font-black uppercase text-white/58">
                          {active ? "Selected" : "Prediction"}
                        </span>
                      </span>
                      {active ? (
                        <span className="grid size-12 place-items-center rounded-full bg-white text-[#090b16]">
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
                      ? "border-[#76ffb8] bg-[#1fd87a]/20 text-[#9dffd0]"
                      : "border-white/10 bg-white/[0.07] text-white/58"
                  }`}
                >
                  {value}
                </motion.button>
              ))}
            </div>
            <input
              className="min-h-14 rounded-2xl border border-white/10 bg-black/24 px-4 text-xl font-black text-white outline-none focus:border-[#76ffb8]"
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
          <div className="mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-[#090b16]/92 p-3 shadow-[0_-18px_46px_rgba(0,0,0,0.48)] backdrop-blur-xl">
            {confirming && selectedForRound ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-2xl bg-white/[0.07] px-4 py-3">
                  <span className="font-black">{selectedForRound}</span>
                  <span className="font-black">{formatCoinString(safeAmount)} coins</span>
                </div>
                <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
                  <button
                    type="button"
                    className="min-h-14 rounded-2xl border border-white/10 bg-white/[0.07] text-sm font-black"
                    disabled={mutation.isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="min-h-14 rounded-2xl bg-gradient-to-r from-[#1fd87a] to-[#8b5cf6] text-sm font-black text-white shadow-[0_0_34px_rgba(31,216,122,0.28)] disabled:opacity-45"
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
                className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1fd87a] via-[#21c5e8] to-[#8b5cf6] text-base font-black text-white shadow-[0_0_38px_rgba(31,216,122,0.32)] disabled:opacity-45"
                disabled={actionDisabled}
                onClick={() => setConfirming(true)}
              >
                {mutation.isPending ? <Loader2 className="animate-spin" size={22} aria-hidden="true" /> : <Zap size={22} aria-hidden="true" />}
                {hasBetForRound ? "Prediction Locked" : selectedForRound ? `Place ${selectedForRound}` : "Place Prediction"}
              </motion.button>
            )}
            {notice ? (
              <p className={`mt-2 rounded-2xl px-3 py-2 text-center text-xs font-black ${mutation.isError ? "bg-[#ff3b4f]/18 text-[#ff98a4]" : "bg-[#1fd87a]/16 text-[#83ffc3]"}`}>
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
        className="grid size-60 place-items-center rounded-full p-3 shadow-[inset_0_0_34px_rgba(255,255,255,0.05),0_0_58px_rgba(31,216,122,0.18)]"
        style={{
          background: `conic-gradient(${isOpen ? "#1fd87a" : "#ffc857"} ${angle}deg, rgba(255,255,255,0.08) 0deg)`,
        }}
      >
        <div className="grid size-full place-items-center rounded-full border border-white/10 bg-[#070812]">
          <div className="text-center">
            <Timer className="mx-auto mb-2 text-white/44" size={24} aria-hidden="true" />
            <p className="text-6xl font-black tabular-nums">{remainingSeconds > 0 ? remainingSeconds : "--"}</p>
            <p className="mt-1 text-xs font-black uppercase text-white/42">seconds</p>
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
