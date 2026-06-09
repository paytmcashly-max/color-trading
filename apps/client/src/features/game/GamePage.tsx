"use client";

import { Check, Clock3, Coins, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PredictionColor } from "@color-trading/shared";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchCurrentRound, fetchWallet, placePrediction } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import { formatCoinString } from "@/utils/format-coins";

const choices: Array<{
  color: PredictionColor;
  label: string;
  className: string;
  button: "danger" | "success" | "violet";
}> = [
  { color: "RED", label: "Red", className: "border-[#f3b3b3] bg-[#fff1f1]", button: "danger" },
  { color: "GREEN", label: "Green", className: "border-[#a9e8c5] bg-[#effcf4]", button: "success" },
  { color: "VIOLET", label: "Violet", className: "border-[#d2c2f2] bg-[#f6f1ff]", button: "violet" },
];

export function GamePage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
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

  const canPredict = currentRound?.status === "OPEN" && Boolean(token);
  const progress = useMemo(() => {
    const max = currentRound?.status === "OPEN" ? 45 : 15;
    return Math.max(0, Math.min(100, (timer / max) * 100));
  }, [currentRound?.status, timer]);

  const mutation = useMutation({
    mutationFn: (choice: PredictionColor) =>
      placePrediction(token!, {
        roundId: currentRound!.id,
        choice,
        coinsStaked: amount,
        idempotencyKey: `ui:${currentRound!.id}:${choice}:${Date.now()}`,
      }),
    onSuccess: (response) => {
      addBet(response.bet);
      if (response.wallet) setWallet(response.wallet);
      setSelected(null);
    },
  });

  return (
    <AppShell title="Live Round">
      <Card className="grid gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-muted">Round #{currentRound?.roundNumber ?? "--"}</p>
            <p className="mt-1 text-4xl font-black tabular-nums">{timer || "--"}s</p>
          </div>
          {currentRound ? <StatusBadge status={currentRound.status} /> : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e8eee8]">
          <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-canvas p-3">
            <p className="font-bold text-muted">Balance</p>
            <p className="mt-1 flex items-center gap-1 text-lg font-black">
              <Coins size={18} aria-hidden="true" />
              {formatCoinString(wallet?.balanceCoins)}
            </p>
          </div>
          <div className="rounded-md bg-canvas p-3">
            <p className="font-bold text-muted">Last result</p>
            <p className="mt-1 flex items-center gap-1 text-lg font-black">
              <Sparkles size={18} aria-hidden="true" />
              {lastResult ?? currentRound?.result ?? "Waiting"}
            </p>
          </div>
        </div>
      </Card>

      <section className="grid gap-3">
        {choices.map((choice) => (
          <button
            key={choice.color}
            disabled={!canPredict}
            onClick={() => setSelected(choice.color)}
            className={`min-h-24 rounded-md border p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50 ${choice.className}`}
          >
            <span className="text-2xl font-black">{choice.label}</span>
            <span className="mt-2 block text-sm font-semibold text-muted">Tap to prepare prediction</span>
          </button>
        ))}
      </section>

      <Card>
        <div className="flex items-center gap-3">
          <Clock3 size={22} aria-hidden="true" />
          <div>
            <p className="font-black">Live activity</p>
            <p className="text-sm text-muted">{activeBets.length} recent prediction updates synced.</p>
          </div>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-[78px] z-20 px-4 md:static md:px-0">
        <Card className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            <input
              className="min-h-12 w-full rounded-md border border-line px-3 text-lg font-black outline-none focus:border-ink"
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
            <Button disabled={!canPredict} onClick={() => setSelected("RED")} className="shrink-0">
              Predict
            </Button>
          </div>
        </Card>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 p-4 md:place-items-center">
          <div className="w-full max-w-md rounded-md bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-muted">Confirm prediction</p>
                <h2 className="mt-1 text-2xl font-black">{selected}</h2>
              </div>
              <button className="rounded-md p-2 text-muted" onClick={() => setSelected(null)}>
                <X size={22} aria-label="Close" />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted">
              {amount} virtual coins will be reserved for round #{currentRound?.roundNumber}.
            </p>
            {mutation.error ? (
              <p className="mt-3 rounded-md bg-[#fee2e2] px-3 py-2 text-sm font-semibold text-[#991b1b]">
                {mutation.error.message}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button onClick={() => mutation.mutate(selected)} disabled={mutation.isPending}>
                <Check size={18} aria-hidden="true" />
                Confirm
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
