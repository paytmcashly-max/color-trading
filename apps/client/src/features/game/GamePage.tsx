"use client";

import dynamic from "next/dynamic";
import { Activity, Check, ChevronRight, Flame, Loader2, Sparkles, Trophy, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PredictionColor } from "@color-trading/shared";

import { AppShell } from "@/components/layout/AppShell";
import { WalletCard } from "@/components/wallet/WalletCard";
import { fetchCurrentRound, fetchMyBetHistory, fetchRoundHistory, placePrediction } from "@/services/api-client";
import { getActiveSocket, placeBetOverSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import { useWallet } from "@/hooks/useWallet";
import type { BetDto, RoundDto, UserBetHistoryDto } from "@/types/api";
import { formatCoinString } from "@/utils/format-coins";

const ResultReveal = dynamic(
  () => import("@/components/game/ResultReveal").then((mod) => mod.ResultReveal),
  {
    ssr: false,
    loading: () => <div className="min-h-28 rounded-[28px] border border-line bg-white" />,
  },
);

const quickAmounts = [10, 50, 100, 500, 1000];

const choices: Array<{
  color: PredictionColor;
  label: string;
  glow: string;
  surface: string;
  orb: string;
}> = [
  {
    color: "GREEN",
    label: "Green",
    glow: "shadow-[0_16px_36px_rgba(22,135,79,0.22)]",
    surface: "from-[#effbf5] to-[#d9f7e7]",
    orb: "bg-[#19d879]",
  },
  {
    color: "RED",
    label: "Red",
    glow: "shadow-[0_16px_36px_rgba(201,42,42,0.18)]",
    surface: "from-[#fff1f2] to-[#ffe1e6]",
    orb: "bg-[#ff3b4f]",
  },
  {
    color: "VIOLET",
    label: "Violet",
    glow: "shadow-[0_16px_36px_rgba(110,70,185,0.20)]",
    surface: "from-[#f5f1ff] to-[#ebe3ff]",
    orb: "bg-[#9b5cff]",
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
  const { wallet, isLoading: walletLoading } = useWallet();
  const [selected, setSelected] = useState<PredictionColor | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [amount, setAmount] = useState(50);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const userId = user?.id;

  const roundQuery = useQuery({ queryKey: ["current-round"], queryFn: fetchCurrentRound });
  const roundHistory = useQuery({
    queryKey: ["round-history"],
    queryFn: fetchRoundHistory,
    refetchInterval: 15_000,
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
  const selectedChoice = choices.find((choice) => choice.color === selectedForRound);
  const canPredict =
    Boolean(token) &&
    Boolean(currentRound) &&
    (currentRound?.status === "OPEN" || currentRound?.phase === "BETTING_OPEN");
  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const amountInvalid = safeAmount <= 0 || safeAmount > totalBalance;
  const myBetForRound = useMemo(() => {
    if (!userId || !currentRound) {
      return null;
    }

    return activeBets.find((bet) => bet.userId === userId && bet.roundId === currentRound.id) ?? null;
  }, [activeBets, currentRound, userId]);
  const latestStoredBet = useMemo(
    () => (currentRound ? myBetsQuery.data?.bets.find((bet) => bet.roundId === currentRound.id) ?? null : null),
    [currentRound, myBetsQuery.data?.bets],
  );
  const currentBet = myBetForRound ?? latestStoredBet;
  const hasBetForRound = Boolean(currentBet);
  const roundResult = currentRound?.result ?? lastResult;
  const outcome = getOutcome(roundResult, currentBet);
  const lockedReason = !canPredict
    ? "Round locked"
    : hasBetForRound
      ? "Prediction placed"
      : amountInvalid
        ? safeAmount > totalBalance
          ? "Low balance"
          : "Set amount"
        : selectedChoice
          ? "Ready"
          : "Pick color";
  const stats = useMemo(() => buildStats(myBetsQuery.data?.bets ?? []), [myBetsQuery.data?.bets]);
  const resultStrip = (roundHistory.data?.rounds ?? []).slice(0, 10);
  const recentActivity = useMemo(() => buildRecentActivity(activeBets), [activeBets]);

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
    <AppShell title="Live Arena">
      <WalletCard wallet={wallet} isLoading={walletLoading} />

      <section className="relative overflow-hidden rounded-[32px] border border-line bg-white p-5 shadow-[0_18px_54px_rgba(23,32,26,0.10)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(22,135,79,0.12),transparent_38%)]" />
        <div className="relative grid gap-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-muted">Round #{currentRound?.roundNumber ?? "--"}</p>
              <h2 className="mt-1 text-2xl font-black text-ink">{roundStatusLabel(currentRound)}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${canPredict ? "bg-[#e5f8ee] text-[#16874f]" : "bg-[#fff4d6] text-[#8a6400]"}`}>
              {canPredict ? "OPEN" : "LOCKED"}
            </span>
          </div>

          <CountdownRing remainingSeconds={timer} isOpen={canPredict} />

          <ResultStrip results={resultStrip} fallbackResult={roundResult} />
        </div>
      </section>

      <section className="grid gap-3" aria-label="Prediction colors">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Prediction</h2>
          <span className="text-xs font-black uppercase text-muted">{lockedReason}</span>
        </div>
        <div className="grid gap-3">
          {choices.map((choice) => {
            const active = selectedForRound === choice.color;
            return (
              <button
                key={choice.color}
                type="button"
                disabled={!canPredict || hasBetForRound}
                onClick={() => {
                  setSelected(choice.color);
                  setSelectedRoundId(currentRound?.id ?? null);
                  setConfirming(false);
                }}
                className={`min-h-24 rounded-[28px] border bg-gradient-to-br ${choice.surface} p-4 text-left transition active:scale-[0.98] disabled:opacity-45 ${
                  active
                    ? `border-[#17201a]/30 ring-4 ring-[#17201a]/5 ${choice.glow}`
                    : "border-line shadow-[0_12px_28px_rgba(23,32,26,0.08)]"
                }`}
                aria-pressed={active}
              >
                <span className="flex items-center justify-between gap-4">
                  <span>
                    <span className="text-2xl font-black text-ink">{choice.label}</span>
                    <span className="mt-2 block text-xs font-bold uppercase text-muted">
                      {active ? "Selected" : hasBetForRound ? `Placed ${currentBet?.choice}` : "Tap"}
                    </span>
                  </span>
                  <span className={`grid size-14 place-items-center rounded-full ${choice.orb} text-white shadow-[0_0_24px_rgba(255,255,255,0.16)]`}>
                    {active ? <Check size={26} aria-hidden="true" /> : <ChevronRight size={24} aria-hidden="true" />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-black">Amount</h2>
        <div className="grid grid-cols-5 gap-2">
          {quickAmounts.map((value) => (
            <button
              key={value}
              type="button"
              disabled={!canPredict || hasBetForRound}
              onClick={() => {
                setAmount(value);
                setConfirming(false);
              }}
              className={`min-h-12 rounded-2xl border text-sm font-black transition active:scale-95 ${
                amount === value
                  ? "border-[#5dffae] bg-[#1fd87a]/18 text-[#7cffbf]"
                  : "border-line bg-white text-muted"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="grid gap-2 rounded-[24px] border border-line bg-white p-4 shadow-[0_10px_24px_rgba(23,32,26,0.06)]">
          <span className="text-xs font-black uppercase text-muted">Custom amount</span>
          <input
            className="min-h-12 rounded-2xl border border-line bg-canvas px-4 text-xl font-black text-ink outline-none focus:border-[#16874f]"
            type="number"
            min={1}
            inputMode="numeric"
            value={Number.isFinite(amount) ? amount : ""}
            onChange={(event) => {
              setAmount(Number(event.target.value));
              setConfirming(false);
            }}
          />
        </label>
      </section>

      <ResultReveal result={roundResult} selection={currentBet?.choice ?? selectedForRound} outcome={outcome} />

      <PlayerStatsCard stats={stats} />
      <RecentActivityFeed items={recentActivity} />

      <div className="fixed inset-x-0 bottom-[82px] z-20 px-4 md:sticky md:bottom-4 md:px-0">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-line bg-white/94 p-3 shadow-[0_-14px_38px_rgba(23,32,26,0.14)] backdrop-blur-xl">
          {confirming && selectedChoice ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
                <span className="font-black text-ink">{selectedChoice.label}</span>
                <span className="font-black text-ink">{formatCoinString(safeAmount)} coins</span>
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
                  className="min-h-14 rounded-2xl bg-gradient-to-r from-[#16874f] to-[#6e46b9] text-sm font-black text-white shadow-[0_14px_28px_rgba(22,135,79,0.22)] disabled:opacity-45"
                  disabled={actionDisabled}
                  onClick={() => selectedForRound && mutation.mutate(selectedForRound)}
                >
                  {mutation.isPending ? <Loader2 className="mx-auto animate-spin" size={22} aria-hidden="true" /> : "Confirm"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#16874f] via-[#1587a8] to-[#6e46b9] text-base font-black text-white shadow-[0_16px_32px_rgba(22,135,79,0.22)] transition active:scale-[0.99] disabled:opacity-45"
              disabled={actionDisabled}
              onClick={() => setConfirming(true)}
            >
              {mutation.isPending ? <Loader2 className="animate-spin" size={22} aria-hidden="true" /> : <Zap size={22} aria-hidden="true" />}
              {hasBetForRound ? "Prediction Locked" : selectedChoice ? `Place ${selectedChoice.label}` : "Place Prediction"}
            </button>
          )}
          {notice ? (
            <p className={`mt-2 rounded-2xl px-3 py-2 text-center text-xs font-black ${mutation.isError ? "bg-[#ff3b4f]/18 text-[#ff98a4]" : "bg-[#1fd87a]/16 text-[#83ffc3]"}`}>
              {notice}
            </p>
          ) : null}
        </div>
      </div>
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
        className="grid size-56 place-items-center rounded-full p-3 shadow-[inset_0_0_34px_rgba(255,255,255,0.05),0_0_50px_rgba(31,216,122,0.16)]"
        style={{
          background: `conic-gradient(${isOpen ? "#1fd87a" : "#ffc857"} ${angle}deg, rgba(255,255,255,0.08) 0deg)`,
        }}
      >
        <div className="grid size-full place-items-center rounded-full border border-line bg-white">
          <div className="text-center">
            <p className="text-6xl font-black tabular-nums text-ink">{remainingSeconds > 0 ? remainingSeconds : "--"}</p>
            <p className="mt-1 text-xs font-black uppercase text-muted">seconds</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultStrip({
  results,
  fallbackResult,
}: {
  results: Array<{ id: string; result: PredictionColor | null }>;
  fallbackResult: PredictionColor | string | null | undefined;
}) {
  const entries = results.length > 0 ? results : Array.from({ length: 10 }, (_, index) => ({ id: `empty-${index}`, result: index === 0 ? fallbackResult ?? null : null }));

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-canvas px-3 py-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        {entries.map((entry) => (
          <span
            key={entry.id}
            className={`grid size-8 shrink-0 place-items-center rounded-full ${resultDot(entry.result)}`}
            aria-label={entry.result ?? "Pending result"}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerStatsCard({ stats }: { stats: ReturnType<typeof buildStats> }) {
  return (
    <section className="rounded-[28px] border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-[#5dffae]" aria-hidden="true" />
        <h2 className="font-black">Your stats</h2>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        <Stat label="Games" value={stats.totalGames} />
        <Stat label="Wins" value={stats.wins} />
        <Stat label="Losses" value={stats.losses} />
        <Stat label="Rate" value={`${stats.winRate}%`} />
        <Stat label="Streak" value={stats.currentStreak} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-canvas p-2 text-center">
      <p className="text-base font-black text-ink">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase text-muted">{label}</p>
    </div>
  );
}

function RecentActivityFeed({ items }: { items: string[] }) {
  return (
    <section className="rounded-[28px] border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
      <div className="flex items-center gap-2">
        <Flame size={18} className="text-[#ffc857]" aria-hidden="true" />
        <h2 className="font-black">Recent activity</h2>
      </div>
      <div className="mt-3 max-h-44 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="text-sm font-bold text-muted">Live wins will appear here.</p>
        ) : null}
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="mb-2 flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2 text-sm font-bold text-muted">
            <Sparkles size={15} className="text-[#5dffae]" aria-hidden="true" />
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function buildStats(bets: UserBetHistoryDto[]) {
  const settled = bets.filter((bet) => bet.status === "WON" || bet.status === "LOST");
  const wins = settled.filter((bet) => bet.status === "WON").length;
  const losses = settled.filter((bet) => bet.status === "LOST").length;
  const winRate = settled.length > 0 ? Math.round((wins / settled.length) * 100) : 0;
  let streak = 0;

  for (const bet of settled) {
    if (bet.status !== "WON") {
      break;
    }
    streak += 1;
  }

  return {
    totalGames: settled.length,
    wins,
    losses,
    winRate,
    currentStreak: streak,
  };
}

function buildRecentActivity(bets: BetDto[]) {
  return bets.slice(0, 12).map((bet) => {
    const user = `${bet.userId.slice(0, 4)}****`;
    if (bet.status === "WON") {
      return `${user} won ${formatCoinString(bet.payoutAmount)}`;
    }
    if (bet.status === "LOST") {
      return `${user} missed ${formatCoinString(bet.coinsStaked)}`;
    }
    return `${user} picked ${bet.choice} for ${formatCoinString(bet.coinsStaked)}`;
  });
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

function roundStatusLabel(round: RoundDto | null) {
  if (!round) {
    return "Syncing round";
  }

  if (round.result || round.phase === "RESULT_DECLARED") {
    return "Result reveal";
  }

  if (round.status === "OPEN" || round.phase === "BETTING_OPEN") {
    return "Live predictions";
  }

  return "Locked phase";
}

function resultDot(result: string | null | undefined) {
  if (result === "RED") {
    return "bg-[#ff3b4f] shadow-[0_0_18px_rgba(255,59,79,0.55)]";
  }

  if (result === "GREEN") {
    return "bg-[#19d879] shadow-[0_0_18px_rgba(25,216,121,0.55)]";
  }

  if (result === "VIOLET") {
    return "bg-[#9b5cff] shadow-[0_0_18px_rgba(155,92,255,0.55)]";
  }

  return "bg-[#dfe6df]";
}
