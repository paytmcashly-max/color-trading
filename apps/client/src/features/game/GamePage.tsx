"use client";

import { Check, Clock3, Coins, Loader2, Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PredictionColor } from "@color-trading/shared";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchCurrentRound, fetchWallet, placePrediction } from "@/services/api-client";
import { getActiveSocket, placeBetOverSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import type { RoundDto } from "@/types/api";
import { formatCoinString } from "@/utils/format-coins";

const choices: Array<{
  color: PredictionColor;
  label: string;
  swatchClassName: string;
  cardClassName: string;
  activeClassName: string;
  button: "danger" | "success" | "violet";
}> = [
  {
    color: "RED",
    label: "Red",
    swatchClassName: "bg-[#d92d20]",
    cardClassName: "border-[#f4b8b2] bg-[#fff3f2]",
    activeClassName: "border-[#d92d20] ring-[#d92d20]/25",
    button: "danger",
  },
  {
    color: "GREEN",
    label: "Green",
    swatchClassName: "bg-[#159947]",
    cardClassName: "border-[#a9e7bd] bg-[#f0fbf3]",
    activeClassName: "border-[#159947] ring-[#159947]/25",
    button: "success",
  },
  {
    color: "VIOLET",
    label: "Violet",
    swatchClassName: "bg-[#7147c7]",
    cardClassName: "border-[#cdbff0] bg-[#f7f2ff]",
    activeClassName: "border-[#7147c7] ring-[#7147c7]/25",
    button: "violet",
  },
];

export function GamePage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const user = useAuthStore((state) => state.user);
  const currentRound = useGameStore((state) => state.currentRound);
  const wallet = useGameStore((state) => state.wallet);
  const timer = useGameStore((state) => state.timerRemainingSeconds);
  const activeBets = useGameStore((state) => state.activeBets);
  const lastResult = useGameStore((state) => state.lastResult);
  const setRound = useGameStore((state) => state.setRound);
  const setWallet = useGameStore((state) => state.setWallet);
  const addBet = useGameStore((state) => state.addBet);
  const [selected, setSelected] = useState<PredictionColor | null>(null);
  const [amount, setAmount] = useState(50);
  const [notice, setNotice] = useState<string | null>(null);
  const userId = user?.id;

  const roundQuery = useQuery({ queryKey: ["current-round"], queryFn: fetchCurrentRound });
  const walletQuery = useQuery({
    queryKey: ["wallet"],
    queryFn: () => fetchWallet(token!),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (roundQuery.data) setRound(roundQuery.data.round);
  }, [roundQuery.data, setRound]);

  useEffect(() => {
    if (walletQuery.data) setWallet(walletQuery.data.wallet);
  }, [walletQuery.data, setWallet]);

  const canPredict =
    Boolean(token) &&
    Boolean(currentRound) &&
    (currentRound?.status === "OPEN" || currentRound?.phase === "BETTING_OPEN");
  const roundMode = getRoundMode(currentRound);
  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const amountInvalid = safeAmount <= 0 || safeAmount > totalBalance;
  const lockedReason = !token
    ? "Sign in to play"
    : !currentRound
      ? "Waiting for round"
      : !canPredict
        ? "Predictions are locked"
        : amountInvalid
          ? safeAmount > totalBalance
            ? "Not enough coins"
            : "Enter an amount"
          : null;
  const progress = useMemo(() => {
    const max = currentRound?.status === "OPEN" || currentRound?.phase === "BETTING_OPEN" ? 45 : 15;
    return Math.max(0, Math.min(100, (timer / max) * 100));
  }, [currentRound?.phase, currentRound?.status, timer]);
  const selectedChoice = choices.find((choice) => choice.color === selected);
  const myLatestBet = useMemo(() => {
    if (!userId) {
      return null;
    }

    return activeBets.find((bet) => bet.userId === userId) ?? null;
  }, [activeBets, userId]);
  const roundResult = currentRound?.result ?? lastResult;
  const resultMessage = getResultMessage(roundResult, myLatestBet);

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
      if (response.wallet) setWallet(response.wallet);
      setNotice(`${response.bet.choice} prediction placed for ${formatCoinString(response.bet.coinsStaked)} coins.`);
    },
    onError: (error) => setNotice(error.message),
  });
  const hasBetForRound = Boolean(currentRound && myLatestBet?.roundId === currentRound.id);
  const placeDisabled = !canPredict || !selected || amountInvalid || mutation.isPending || hasBetForRound;

  return (
    <AppShell title="Live Round">
      <section className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
        <Card className="grid gap-4 overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-muted">Round #{currentRound?.roundNumber ?? "--"}</p>
              <p className="mt-1 text-5xl font-black tabular-nums">{timer > 0 ? timer : "--"}s</p>
            </div>
            <StatusBadge status={roundMode} />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-bold uppercase text-muted">
              <span>{canPredict ? "Open window" : roundMode === "RESULT" ? "Result" : "Lock window"}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#e4ebe3]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  canPredict ? "bg-[#159947]" : "bg-[#d99a20]"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="rounded-md border border-line bg-canvas px-3 py-2 text-sm font-semibold text-muted">
            {canPredict
              ? "Choose a color, set coins, and place before the timer locks."
              : roundMode === "RESULT"
                ? "Result is being displayed. Next round starts automatically."
                : "Betting is closed for this round."}
          </div>
        </Card>

        <Card className="grid gap-3">
          <div>
            <p className="text-sm font-bold text-muted">Current balance</p>
            <p className="mt-1 flex items-center gap-2 text-3xl font-black">
              <Coins size={18} aria-hidden="true" />
              {formatCoinString(wallet?.totalBalance)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-bold text-muted">
            <div className="rounded-md bg-canvas p-3">
              <span className="block">Deposit</span>
              <strong className="mt-1 block text-base text-ink">{formatCoinString(wallet?.depositBalance)}</strong>
            </div>
            <div className="rounded-md bg-canvas p-3">
              <span className="block">Winning</span>
              <strong className="mt-1 block text-base text-ink">{formatCoinString(wallet?.winningBalance)}</strong>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-3" aria-label="Prediction colors">
        {choices.map((choice) => (
          <button
            key={choice.color}
            type="button"
            disabled={!canPredict || hasBetForRound}
            onClick={() => setSelected(choice.color)}
            className={`min-h-24 rounded-md border p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50 ${
              selected === choice.color ? `ring-4 ${choice.activeClassName}` : ""
            } ${choice.cardClassName}`}
            aria-pressed={selected === choice.color}
          >
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="text-2xl font-black">{choice.label}</span>
                <span className="mt-2 block text-sm font-semibold text-muted">
                  {hasBetForRound && myLatestBet ? `Placed ${myLatestBet.choice}` : canPredict ? "Tap to select" : "Closed"}
                </span>
              </span>
              <span className={`grid size-12 place-items-center rounded-full ${choice.swatchClassName}`}>
                {selected === choice.color ? <Check size={24} className="text-white" aria-hidden="true" /> : null}
              </span>
            </span>
          </button>
        ))}
      </section>

      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-muted">Result display</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-black">
              <Sparkles size={22} aria-hidden="true" />
              {roundResult ? `${roundResult} wins` : "Waiting"}
            </p>
            <p className="mt-1 text-sm font-semibold text-muted">{resultMessage}</p>
          </div>
          <ResultOrb color={roundResult} />
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-[78px] z-20 px-4 md:static md:px-0">
        <Card className="mx-auto max-w-5xl">
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-bold uppercase text-muted">Coins</span>
                <input
                  className="min-h-12 w-32 rounded-md border border-line px-3 text-lg font-black outline-none focus:border-ink"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
              </label>
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-black">
                  {selectedChoice ? `${selectedChoice.label} selected` : "Pick a color"}
                </p>
                <p className="mt-1 text-xs font-semibold text-muted">
                  {hasBetForRound ? "Prediction already placed" : lockedReason ?? "Ready"}
                </p>
              </div>
            </div>
            <Button
              variant={selectedChoice?.button ?? "primary"}
              disabled={placeDisabled}
              onClick={() => selected && mutation.mutate(selected)}
              className="w-full"
            >
              {mutation.isPending ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Trophy size={18} aria-hidden="true" />}
              {mutation.isPending ? "Placing..." : selectedChoice ? `Place ${selectedChoice.label}` : "Place bet"}
            </Button>
            {notice ? (
              <p className={`rounded-md px-3 py-2 text-sm font-semibold ${mutation.isError ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#e8f6ee] text-[#0f5b38]"}`}>
                {notice}
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <Clock3 size={22} aria-hidden="true" />
          <div>
            <p className="font-black">Live activity</p>
            <p className="text-sm text-muted">{activeBets.length} recent prediction updates synced.</p>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

function getRoundMode(round: RoundDto | null) {
  if (!round) {
    return "IDLE";
  }

  if (round.result || round.phase === "RESULT_DECLARED") {
    return "RESULT";
  }

  if (round.status === "OPEN" || round.phase === "BETTING_OPEN") {
    return "OPEN";
  }

  return "LOCKED";
}

function getResultMessage(result: string | null | undefined, bet: { choice: PredictionColor; roundId: string } | null) {
  if (!result) {
    return bet ? "Prediction locked in. Waiting for the result." : "Place a prediction before the round locks.";
  }

  if (!bet) {
    return "Result synced live.";
  }

  return bet.choice === result ? "You won this round." : "This round missed. Try the next one.";
}

function ResultOrb({ color }: { color: string | null | undefined }) {
  const className =
    color === "RED"
      ? "bg-[#d92d20]"
      : color === "GREEN"
        ? "bg-[#159947]"
        : color === "VIOLET"
          ? "bg-[#7147c7]"
          : "bg-[#cbd5d1]";

  return (
    <div className="relative grid size-16 shrink-0 place-items-center">
      {color ? <span className={`absolute inset-0 animate-ping rounded-full ${className} opacity-20`} /> : null}
      <span className={`relative size-12 rounded-full shadow-inner ${className}`} />
    </div>
  );
}
