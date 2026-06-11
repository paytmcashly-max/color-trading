"use client";

import { motion } from "framer-motion";
import { Check, Circle, Flame, Gem, Loader2, LockKeyhole, Timer, X, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PredictionColor } from "@color-trading/shared";

import { AppShell } from "@/components/layout/AppShell";
import { fetchCurrentRound, fetchMyBetHistory, fetchRoundHistory } from "@/services/api-client";
import { getActiveSocket, placeBetOverSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import { useWallet } from "@/hooks/useWallet";
import {
  betStatusLabel,
  errorToPlayerMessage,
  playerConnectionCopy,
  resultPopupCopy,
  roundStatusLabel,
} from "@/lib/player-copy";
import type { BetDto, RoundDto, RoundHistoryDto, UserBetHistoryDto } from "@/types/api";
import { formatCoinString } from "@/utils/format-coins";

const quickAmounts = [10, 50, 100, 500, 1000];

const choices: Array<{
  color: PredictionColor;
  label: string;
  surface: string;
  glow: string;
  ratio: string;
  icon: LucideIcon;
}> = [
  {
    color: "GREEN",
    label: "Green",
    surface: "from-[#22c55e] to-[#047857]",
    glow: "shadow-[0_16px_30px_rgba(22,163,74,0.28)]",
    ratio: "1:2",
    icon: Circle,
  },
  {
    color: "VIOLET",
    label: "Violet",
    surface: "from-[#a855f7] to-[#6d28d9]",
    glow: "shadow-[0_16px_30px_rgba(126,34,206,0.26)]",
    ratio: "1:4.5",
    icon: Gem,
  },
  {
    color: "RED",
    label: "Red",
    surface: "from-[#f97316] to-[#dc2626]",
    glow: "shadow-[0_16px_30px_rgba(220,38,38,0.26)]",
    ratio: "1:2",
    icon: Flame,
  },
];

export function GamePage({ title = "Fast Parity" }: { title?: string } = {}) {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const user = useAuthStore((state) => state.user);
  const currentRound = useGameStore((state) => state.currentRound);
  const timer = useGameStore((state) => state.timerRemainingSeconds);
  const activeBets = useGameStore((state) => state.activeBets);
  const lastResult = useGameStore((state) => state.lastResult);
  const lastCancellation = useGameStore((state) => state.lastCancellation);
  const recentResults = useGameStore((state) => state.recentResults);
  const settlementNotice = useGameStore((state) => state.settlementNotice);
  const socketConnected = useGameStore((state) => state.socketConnected);
  const gamePaused = useGameStore((state) => state.gamePaused);
  const dismissSettlementNotice = useGameStore((state) => state.dismissSettlementNotice);
  const setRound = useGameStore((state) => state.setRound);
  const setWallet = useGameStore((state) => state.setWallet);
  const addBet = useGameStore((state) => state.addBet);
  const applyRealtimeEvent = useGameStore((state) => state.applyRealtimeEvent);
  const { wallet, isLoading: walletLoading } = useWallet();
  const [selectedChoices, setSelectedChoices] = useState<PredictionColor[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [amount, setAmount] = useState(50);
  const [amountInput, setAmountInput] = useState("50");
  const [quantity, setQuantity] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ordersTab, setOrdersTab] = useState<"everyone" | "mine">("everyone");
  const [now, setNow] = useState(() => Date.now());
  const userId = user?.id;

  const roundQuery = useQuery({ queryKey: ["current-round"], queryFn: fetchCurrentRound });
  const roundHistoryQuery = useQuery({
    queryKey: ["round-history", "game"],
    queryFn: () => fetchRoundHistory({ limit: 30 }),
    refetchInterval: 20_000,
  });
  const myBetsQuery = useQuery({
    queryKey: ["my-bet-history", userId, { limit: 50 }],
    queryFn: () => fetchMyBetHistory(token!, { limit: 50 }),
    enabled: Boolean(token && userId),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (roundQuery.data) {
      setRound(roundQuery.data.round);
    }
  }, [roundQuery.data, setRound]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!settlementNotice) {
      return;
    }

    const timeoutId = window.setTimeout(dismissSettlementNotice, 7000);
    return () => window.clearTimeout(timeoutId);
  }, [dismissSettlementNotice, settlementNotice]);

  useEffect(() => {
    const recentSettled = myBetsQuery.data?.bets.find((bet) =>
      bet.status !== "PENDING" &&
      Boolean(bet.settledAt) &&
      Date.now() - new Date(bet.settledAt!).getTime() < 5 * 60_000 &&
      !readShownSettlementIds().includes(bet.id),
    );

    if (recentSettled) {
      applyRealtimeEvent("bet:settled", recentSettled);
      rememberSettlementShown(recentSettled.id);
    }
  }, [applyRealtimeEvent, myBetsQuery.data?.bets]);

  const selectedForRound = selectedRoundId === currentRound?.id ? selectedChoices : [];
  const roundRemainingSeconds = currentRound
    ? Math.max(0, Math.ceil((new Date(currentRound.endTime).getTime() - now) / 1000))
    : timer;
  const bettingRemainingSeconds = currentRound
    ? Math.max(0, Math.ceil((new Date(currentRound.lockTime).getTime() - now) / 1000))
    : 0;
  const bettingWindowOpen = bettingRemainingSeconds > 0;
  const canPredict =
    Boolean(token) &&
    Boolean(currentRound) &&
    socketConnected &&
    !gamePaused &&
    bettingWindowOpen &&
    (currentRound?.status === "OPEN" || currentRound?.phase === "BETTING_OPEN");
  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeQuantity = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
  const totalStake = safeAmount * safeQuantity * selectedForRound.length;
  const potentialPayout = totalStake * 2;
  const amountInvalid = safeAmount <= 0 || totalStake > totalBalance;
  const currentBets = useMemo(() => {
    if (!userId || !currentRound) {
      return [];
    }

    const socketBets = activeBets.filter((bet) => bet.userId === userId && bet.roundId === currentRound.id);
    const historyBets = myBetsQuery.data?.bets.filter((bet) => bet.roundId === currentRound.id) ?? [];

    return dedupeBets([...socketBets, ...historyBets]);
  }, [activeBets, currentRound, myBetsQuery.data?.bets, userId]);
  const roundCancelled = currentRound?.dbStatus === "CANCELLED" || currentRound?.status === "CANCELLED";
  const roundResult = roundCancelled ? null : currentRound?.result ?? lastResult;
  const outcome = getOutcome(roundResult, currentBets);
  const roundHistory = roundHistoryQuery.data?.rounds ?? [];
  const latestBets = currentRound
    ? activeBets
        .filter((bet) => bet.roundId === currentRound.id)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        .slice(-4)
    : [];
  const myBets = myBetsQuery.data?.bets.slice(0, 10) ?? [];
  const showLockOverlay = Boolean(currentRound) && !roundResult && (!bettingWindowOpen || !canPredict);

  const mutation = useMutation({
    mutationFn: async () => {
      const bets: BetDto[] = [];
      let walletUpdate = wallet;

      for (const choice of selectedForRound) {
        for (let index = 0; index < safeQuantity; index += 1) {
          const idempotencyKey = `ui:${currentRound!.id}:${choice}:${crypto.randomUUID()}:${index}`;
          const input = {
            roundId: currentRound!.id,
            choice,
            coinsStaked: safeAmount,
            idempotencyKey,
          };
          if (!getActiveSocket()) {
            throw new Error(playerConnectionCopy.disconnected);
          }
          const response = await placeBetOverSocket(input);

          bets.push(response.bet);
          if (response.wallet) {
            walletUpdate = response.wallet;
          }
        }
      }

      return { bets, wallet: walletUpdate };
    },
    onSuccess: (response) => {
      response.bets.forEach(addBet);
      if (response.wallet) {
        setWallet(response.wallet);
      }
      setConfirming(false);
      setNotice("Bet placed. Your amount is locked for this round. Waiting for the result.");
    },
    onError: (error) => {
      setConfirming(false);
      const message = errorToPlayerMessage(error);
      setNotice(message);
      if (message === "Betting is closed for this round.") {
        void roundQuery.refetch();
      }
    },
  });

  const actionDisabled =
    !canPredict ||
    selectedForRound.length === 0 ||
    amountInvalid ||
    mutation.isPending ||
    safeQuantity <= 0;

  return (
    <AppShell title={title}>
      <section className="grid gap-3 pb-28">
        {!socketConnected ? (
          <section className="rounded-2xl border border-[#f1c1c1] bg-[#fff7f7] px-3 py-2 text-sm font-black text-[#8d1f1f]">
            {playerConnectionCopy.disconnected}
          </section>
        ) : null}
        {gamePaused ? (
          <section className="rounded-2xl border border-[#f7df9e] bg-[#fff8e6] px-3 py-2 text-sm font-black text-[#8a5a00]">
            Game paused. Please wait.
          </section>
        ) : null}
        {roundQuery.isLoading ? (
          <section className="rounded-2xl border border-line bg-white px-3 py-2 text-sm font-bold text-muted">
            Loading current round...
          </section>
        ) : !currentRound ? (
          <section className="rounded-2xl border border-line bg-white px-3 py-2 text-sm font-bold text-muted">
            The next round will be ready soon.
          </section>
        ) : null}
        <section className="rounded-3xl border border-line bg-[linear-gradient(135deg,#ffffff,#f1faf4)] p-3 shadow-[0_10px_24px_rgba(23,32,26,0.07)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase text-muted">Current round</p>
              <h1 className="mt-0.5 truncate text-xl font-black tabular-nums text-ink sm:text-2xl">
                {currentRound?.roundNumber ?? "--"}
              </h1>
              <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${canPredict ? "bg-[#dff8e9] text-[#106b3d]" : "bg-[#fff3cd] text-[#8a5a00]"}`}>
                {roundStatusLabel(currentRound?.dbStatus ?? currentRound?.status)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-black uppercase text-muted">Round timer</p>
              <CountdownBoxes remainingSeconds={roundRemainingSeconds} locked={showLockOverlay} warning={bettingRemainingSeconds <= 5 && bettingRemainingSeconds > 0} />
            </div>
          </div>
        </section>

        {roundCancelled ? (
          <section className="rounded-2xl border border-[#f1c1c1] bg-[#fff7f7] px-3 py-2 text-sm font-black text-[#8d1f1f]">
            Round cancelled. Your bet amount has been returned to your wallet.
            {lastCancellation?.roundId === currentRound?.id && lastCancellation.reason
              ? ` ${lastCancellation.reason}`
              : ""}
          </section>
        ) : null}

        <section className="grid gap-2 rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-ink">Pick a color</h2>
            </div>
            {selectedForRound.length > 0 ? (
              <span className="rounded-full bg-[#eef3ee] px-3 py-1 text-[10px] font-black uppercase text-ink">
                Your pick: {colorLabel(selectedForRound[0])}
              </span>
            ) : null}
          </div>
          <div className="relative grid grid-cols-3 gap-2">
              {showLockOverlay ? (
                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/50 backdrop-blur-[1px]">
                  <div className="grid size-16 place-items-center rounded-full border border-[#f7df9e] bg-[#fff8e6]/80 text-[#8a5a00] shadow-sm">
                    <LockKeyhole size={28} aria-hidden="true" />
                  </div>
                </div>
              ) : null}
              {choices.map((choice) => {
                const active = selectedForRound.includes(choice.color);
                const Icon = choice.icon;
                return (
                  <motion.button
                    key={choice.color}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    disabled={!canPredict}
                    onClick={() => {
                      setSelectedRoundId(currentRound?.id ?? null);
                      setSelectedChoices((current) => (current.includes(choice.color) ? [] : [choice.color]));
                      setConfirming(false);
                    }}
                    className={`relative min-h-16 rounded-2xl border bg-gradient-to-br ${choice.surface} p-2 text-center text-white transition disabled:opacity-45 ${
                      active ? `border-white ring-4 ring-ink/10 ${choice.glow}` : "border-white/70 shadow-[0_10px_22px_rgba(23,32,26,0.10)]"
                    }`}
                  >
                    <span className="grid justify-items-center gap-1">
                      <span className="grid size-7 place-items-center rounded-full bg-white/20 text-white">
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="text-sm font-black">{choice.label}</span>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-black text-white">{choice.ratio}</span>
                      {active ? (
                        <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-white text-ink shadow-sm">
                          <Check size={14} aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                  </motion.button>
                );
              })}
            </div>
        </section>

        <section className="rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black">Bet amount</h2>
            </div>
            <p className="text-xs font-black text-muted">Your balance {walletLoading ? "..." : formatCoinString(wallet?.totalBalance)}</p>
          </div>
          <div className="grid gap-2">
            <p className="text-[10px] font-black uppercase text-muted">Quick pick</p>
            <div className="grid grid-cols-5 gap-1.5">
              {quickAmounts.map((value) => (
                <motion.button
                  key={value}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  disabled={!canPredict}
                  onClick={() => {
                    setAmount(value);
                    setAmountInput(String(value));
                    setConfirming(false);
                  }}
                  className={`min-h-11 rounded-xl border text-sm font-black ${
                    amount === value
                      ? "border-[#16874f] bg-[#dff8e9] text-[#106b3d]"
                      : "border-line bg-[#f8faf7] text-muted"
                  }`}
                >
                  {value >= 1000 ? "1K" : value}
                </motion.button>
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_126px] gap-2">
              <label className="grid gap-1">
                <span className="text-[10px] font-black uppercase text-muted">Enter bet amount</span>
                <input
                  className="min-h-12 w-full rounded-2xl border border-line bg-white px-3 text-lg font-black text-ink outline-none focus:border-[#16874f]"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setAmountInput(nextValue);
                    setAmount(nextValue === "" ? Number.NaN : Number(nextValue));
                    setConfirming(false);
                  }}
                  aria-label="Custom amount"
                  placeholder="Enter bet amount"
                />
              </label>
              <div className="grid gap-1">
                <span className="text-center text-[10px] font-black uppercase text-muted">Quantity</span>
                <div className="grid grid-cols-[32px_1fr_32px] items-center gap-1 rounded-2xl border border-line bg-[#f8faf7] p-1.5">
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-xl bg-white text-lg font-black text-ink shadow-sm disabled:opacity-45"
                    disabled={!canPredict || quantity <= 1}
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <p className="text-center text-base font-black text-ink">x{safeQuantity}</p>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-xl bg-white text-lg font-black text-ink shadow-sm disabled:opacity-45"
                    disabled={!canPredict}
                    onClick={() => setQuantity((current) => Math.min(20, current + 1))}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#eef3ee] px-3 py-2 text-sm font-black">
              <span className="text-muted">Bet amount</span>
              <span className={amountInvalid ? "text-[#991b1b]" : "text-ink"}>{formatCoinString(totalStake)}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#f8faf7] px-3 py-2 text-sm font-black">
              <span className="text-muted">Possible win</span>
              <span className="text-[#106b3d]">{formatCoinString(potentialPayout)}</span>
            </div>
          </div>
        </section>

        <RecordPanel
          rounds={roundHistory}
          recentResults={recentResults}
          currentResult={roundResult}
          outcome={outcome}
        />
        <OrdersPanel
          tab={ordersTab}
          onTabChange={setOrdersTab}
          everyoneBets={latestBets}
          myBets={myBets}
        />

        <div className="fixed inset-x-0 bottom-[82px] z-20 px-4 md:sticky md:bottom-4 md:px-0">
          <div className="mx-auto max-w-5xl rounded-3xl border border-line bg-white/96 p-3 shadow-[0_-10px_30px_rgba(23,32,26,0.12)] backdrop-blur">
            {confirming && selectedForRound.length > 0 ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between rounded-2xl bg-[#f8faf7] px-4 py-3">
                  <span className="min-w-0 truncate font-black">{selectedForRound.map(colorLabel).join(", ")} x{safeQuantity}</span>
                  <span className="font-black">{formatCoinString(totalStake)}</span>
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
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={20} aria-hidden="true" />
                        Placing bet...
                      </span>
                    ) : "Confirm bet"}
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
                {mutation.isPending
                  ? "Placing bet..."
                  : !canPredict
                  ? !socketConnected
                    ? "Reconnecting..."
                    : gamePaused
                      ? "Game Paused"
                      : safeAmount <= 0
                        ? "Enter amount"
                        : totalStake > totalBalance
                          ? "Not enough balance"
                          : "Betting closed"
                  : "Place bet"}
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
      {settlementNotice ? (
        <BetResultNotice bet={settlementNotice} onClose={dismissSettlementNotice} />
      ) : null}
    </AppShell>
  );
}

function CountdownBoxes({ remainingSeconds, locked, warning }: { remainingSeconds: number; locked: boolean; warning: boolean }) {
  const safe = Math.max(0, remainingSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  const digits = `${minutes.toString().padStart(2, "0")}${seconds.toString().padStart(2, "0")}`.split("");

  return (
    <div className="mt-2 flex items-center justify-end gap-1">
      {locked ? (
        <LockKeyhole size={16} className="mr-1 text-[#8a5a00]" aria-hidden="true" />
      ) : (
        <Timer size={16} className="mr-1 text-muted" aria-hidden="true" />
      )}
      {digits.map((digit, index) => (
        <span
          key={`${digit}-${index}`}
          className={`grid size-8 place-items-center rounded-md text-lg font-black tabular-nums ${
            locked ? "bg-[#fff3cd] text-[#8a5a00]" : warning ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#eef3ee] text-ink"
          }`}
        >
          {digit}
        </span>
      ))}
    </div>
  );
}

function RecordPanel({
  rounds,
  recentResults,
  currentResult,
  outcome,
}: {
  rounds: RoundHistoryDto[];
  recentResults: Array<Pick<RoundDto, "id" | "roundNumber" | "result">>;
  currentResult: string | null | undefined;
  outcome: "WIN" | "LOSS" | "WAITING";
}) {
  const displayRounds = [
    ...recentResults,
    ...rounds.map((round) => ({
      id: round.id,
      roundNumber: round.roundNumber,
      result: round.result,
    })),
  ]
    .filter((round, index, all) => all.findIndex((item) => item.id === round.id) === index)
    .slice(0, 15);

  return (
    <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
      <div className="flex items-center justify-between">
        <h2 className="font-black">Record</h2>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${outcome === "WIN" ? "bg-[#dff8e9] text-[#106b3d]" : outcome === "LOSS" ? "bg-[#fee2e2] text-[#991b1b]" : "bg-[#eef1ef] text-muted"}`}>
          {currentResult ? `Last result: ${colorLabel(currentResult)}` : "Waiting"}
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
  const liveRows: OrderRow[] =
    tab === "everyone"
      ? everyoneBets.map((bet) => ({
          id: bet.id,
          user: maskUser(bet.userId),
          choice: bet.choice,
          amount: bet.coinsStaked,
          period: bet.roundId.slice(0, 6),
          status: bet.status,
          payoutAmount: bet.payoutAmount,
          netProfitLoss: bet.netProfitLoss,
        }))
      : myBets.map((bet) => ({
          id: bet.id,
          user: maskUser(bet.userId),
          choice: bet.choice,
          amount: bet.coinsStaked,
          period: getBetPeriodLabel(bet),
          status: bet.status,
          payoutAmount: bet.payoutAmount,
          netProfitLoss: bet.netProfitLoss,
          result: bet.result,
          createdAt: bet.createdAt,
          settledAt: bet.settledAt,
        }));
  const rows = tab === "everyone" ? [...liveRows, ...dummyOrders].slice(0, 4) : liveRows;
  const tickerRows = tab === "everyone" ? [...rows, ...rows] : rows;

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_14px_34px_rgba(23,32,26,0.08)]">
      <div className="grid grid-cols-2 border-b border-line text-sm font-black">
        <button
          type="button"
          className={`min-h-12 ${tab === "everyone" ? "border-b-2 border-[#16874f] text-ink" : "text-muted"}`}
          onClick={() => onTabChange("everyone")}
        >
          Everyone&apos;s Bets
        </button>
        <button
          type="button"
          className={`min-h-12 ${tab === "mine" ? "border-b-2 border-[#16874f] text-ink" : "text-muted"}`}
          onClick={() => onTabChange("mine")}
        >
          My Bets
        </button>
      </div>
      {tab === "everyone" ? (
        <div className="grid grid-cols-[1fr_0.8fr_0.8fr] gap-2 px-4 py-3 text-[11px] font-black uppercase text-muted">
          <span>User</span>
          <span>Pick</span>
          <span className="text-right">Bet amount</span>
        </div>
      ) : null}
      <div className={`h-[250px] px-4 pb-4 ${tab === "everyone" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-[#f8faf7] px-3 py-4 text-center text-sm font-bold text-muted">
            {tab === "everyone" ? "No bets in this round yet." : "Your bets will appear here."}
          </p>
        ) : (
          <motion.div
            key={`${tab}-${rows.map((row) => row.id).join("-")}`}
            animate={tab === "everyone" ? { y: ["0%", "-50%"] } : { y: 0 }}
            transition={tab === "everyone" ? { duration: 7, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
            className="grid gap-1"
          >
          {tickerRows.map((order, index) => (
            <motion.div
              key={`${order.id}-${index}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: Math.min(index, 4) * 0.035 }}
              className={tab === "everyone"
                ? "grid grid-cols-[1fr_0.8fr_0.8fr] items-center gap-2 rounded-2xl bg-[#f8faf7] px-3 py-2 text-sm font-bold"
                : "grid gap-2 rounded-2xl border border-line bg-[#f8faf7] px-3 py-3 text-sm font-bold"}
            >
              {tab === "everyone" ? (
                <>
                  <span className="truncate text-muted">{order.user}</span>
                  <span className="flex items-center gap-2">
                    <ResultDot result={order.choice} small />
                    {order.choice.slice(0, 1)}
                  </span>
                  <OrderAmount order={order} />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-ink">{order.period}</span>
                    <OrderStatus status={order.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <OrderField label="Your pick" value={colorLabel(order.choice)} result={order.choice} />
                    <OrderField label="Result" value={order.result ? colorLabel(order.result) : "Waiting"} result={order.result} />
                    <OrderField label="Bet amount" value={formatCoinString(order.amount)} />
                    <OrderField label="Profit / Loss" value={<OrderAmount order={order} />} />
                  </div>
                  <p className="text-[10px] font-bold text-muted">
                    {formatOrderTime(order.createdAt)}
                    {order.settledAt ? ` | Settled ${formatOrderTime(order.settledAt)}` : " | Waiting for round result"}
                  </p>
                </>
              )}
            </motion.div>
          ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}

function OrderAmount({ order }: { order: OrderRow }) {
  if (order.status === "PENDING") {
    return (
      <span className="truncate text-right font-black tabular-nums text-[#8a5a00]">
        Waiting for result
      </span>
    );
  }

  if (order.status === "CANCELLED") {
    return <span className="truncate text-right font-black text-muted">Refunded</span>;
  }

  const net = Number(order.netProfitLoss ?? (order.status === "WON" ? order.payoutAmount : -Number(order.amount)));
  const win = net > 0;

  return (
    <span className={`truncate text-right font-black tabular-nums ${win ? "text-[#106b3d]" : "text-[#991b1b]"}`}>
      {win ? "+" : ""}{formatCoinString(net)}
    </span>
  );
}

function OrderStatus({ status }: { status: string }) {
  const label = betStatusLabel(status);
  const tone = status === "WON"
    ? "bg-[#dff8e9] text-[#106b3d]"
    : status === "LOST"
      ? "bg-[#fee2e2] text-[#991b1b]"
      : status === "CANCELLED"
        ? "bg-[#eef1ef] text-muted"
        : "bg-[#fff3cd] text-[#8a5a00]";

  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{label}</span>;
}

function OrderField({ label, value, result }: { label: string; value: React.ReactNode; result?: string | null }) {
  return (
    <div className="rounded-xl bg-white px-2.5 py-2">
      <p className="text-[9px] font-black uppercase text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1.5 font-black text-ink">
        {result ? <ResultDot result={result} small /> : null}
        {value}
      </div>
    </div>
  );
}

function formatOrderTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";
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

function dedupeBets<TBet extends BetDto>(bets: TBet[]) {
  return bets.filter((bet, index, all) => all.findIndex((item) => item.id === bet.id) === index);
}

interface OrderRow {
  id: string;
  user: string;
  period: string;
  choice: PredictionColor;
  amount: string | number;
  status: string;
  payoutAmount?: string;
  netProfitLoss?: string | null;
  result?: PredictionColor | null;
  createdAt?: string;
  settledAt?: string | null;
}

const dummyOrders: OrderRow[] = [
  { id: "dummy-live-1", user: "***114", period: "#live", choice: "GREEN", amount: 50, status: "PENDING" },
  { id: "dummy-live-2", user: "***821", period: "#live", choice: "RED", amount: 100, status: "PENDING" },
  { id: "dummy-live-3", user: "***309", period: "#live", choice: "VIOLET", amount: 20, status: "PENDING" },
  { id: "dummy-live-4", user: "***640", period: "#live", choice: "GREEN", amount: 200, status: "PENDING" },
];

function BetResultNotice({ bet, onClose }: { bet: BetDto; onClose: () => void }) {
  const refunded = bet.status === "CANCELLED";
  const won = bet.status === "WON";
  const net = Number(bet.netProfitLoss ?? 0);
  const copy = resultPopupCopy(bet.status);
  const surface = refunded
    ? "border-[#d9dfd9] bg-[#f6f8f6]"
    : won
      ? "border-[#9fddba] bg-[#effbf4]"
      : "border-[#f1c1c1] bg-[#fff5f5]";

  return (
    <motion.aside
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12 }}
      className={`fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-3xl border p-4 shadow-[0_18px_48px_rgba(23,32,26,0.18)] ${surface}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-ink">{copy.title}</p>
          <p className="mt-0.5 text-xs font-bold text-muted">
            {copy.subtitle}
          </p>
        </div>
        <button type="button" className="grid size-9 place-items-center rounded-full bg-white text-ink shadow-sm" onClick={onClose} aria-label="Close result">
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      {!refunded ? (
        <p className="mt-3 text-xs font-bold text-muted">
          Your pick: <b className="text-ink">{colorLabel(bet.choice)}</b> | Result: <b className="text-ink">{colorLabel(bet.result)}</b>
        </p>
      ) : null}
      <div className={`mt-3 grid ${refunded ? "grid-cols-2" : won ? "grid-cols-3" : "grid-cols-2"} gap-2 text-center`}>
        <ResultMetric label="Bet amount" value={bet.coinsStaked} />
        {won ? <ResultMetric label="You received" value={bet.payoutAmount} /> : null}
        <ResultMetric
          label={won ? "Profit" : refunded ? "Refunded amount" : "Loss"}
          value={refunded ? bet.coinsStaked : `${net > 0 ? "+" : ""}${Math.abs(net)}`}
          tone={won ? "win" : refunded ? "neutral" : "loss"}
        />
      </div>
      <button type="button" className="mt-3 min-h-11 w-full rounded-2xl bg-ink text-sm font-black text-white" onClick={onClose}>
        {copy.action}
      </button>
    </motion.aside>
  );
}

function ResultMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "win" | "loss" | "neutral" }) {
  const toneClass = tone === "win" ? "text-[#106b3d]" : tone === "loss" ? "text-[#991b1b]" : "text-ink";
  return (
    <div className="rounded-2xl bg-white px-2 py-2 shadow-sm">
      <p className="text-[9px] font-black uppercase text-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-black tabular-nums ${toneClass}`}>{formatCoinString(value)}</p>
    </div>
  );
}

function getOutcome(
  result: string | null | undefined,
  bets: Array<Pick<BetDto, "choice">>,
): "WIN" | "LOSS" | "WAITING" {
  if (!result || bets.length === 0) {
    return "WAITING";
  }

  return bets.some((bet) => bet.choice === result) ? "WIN" : "LOSS";
}

function colorLabel(value: string | null | undefined) {
  return value ? value.charAt(0) + value.slice(1).toLowerCase() : "Waiting";
}

const SETTLEMENT_SESSION_KEY = "shown-settled-bet-ids";

function rememberSettlementShown(betId: string) {
  try {
    const ids = [betId, ...readShownSettlementIds().filter((id) => id !== betId)].slice(0, 100);
    window.sessionStorage.setItem(SETTLEMENT_SESSION_KEY, JSON.stringify(ids));
  } catch {
    // In-memory settlement dedupe remains active when storage is unavailable.
  }
}

function readShownSettlementIds(): string[] {
  try {
    const value = window.sessionStorage.getItem(SETTLEMENT_SESSION_KEY);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
