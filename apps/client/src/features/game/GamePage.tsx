"use client";

import { motion } from "framer-motion";
import { Check, Circle, Flame, Gem, Loader2, LockKeyhole, Timer, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

export function GamePage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const user = useAuthStore((state) => state.user);
  const currentRound = useGameStore((state) => state.currentRound);
  const timer = useGameStore((state) => state.timerRemainingSeconds);
  const activeBets = useGameStore((state) => state.activeBets);
  const lastResult = useGameStore((state) => state.lastResult);
  const recentResults = useGameStore((state) => state.recentResults);
  const setRound = useGameStore((state) => state.setRound);
  const setWallet = useGameStore((state) => state.setWallet);
  const addBet = useGameStore((state) => state.addBet);
  const { wallet } = useWallet();
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

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const selectedForRound = selectedRoundId === currentRound?.id ? selectedChoices : [];
  const roundRemainingSeconds = currentRound
    ? Math.max(0, Math.ceil((new Date(currentRound.endTime).getTime() - now) / 1000))
    : timer;
  const bettingWindowOpen = roundRemainingSeconds > 15;
  const canPredict =
    Boolean(token) &&
    Boolean(currentRound) &&
    bettingWindowOpen &&
    (currentRound?.status === "OPEN" || currentRound?.phase === "BETTING_OPEN");
  const totalBalance = Number(wallet?.totalBalance ?? 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeQuantity = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
  const totalStake = safeAmount * safeQuantity * selectedForRound.length;
  const amountInvalid = safeAmount <= 0 || totalStake > totalBalance;
  const currentBets = useMemo(() => {
    if (!userId || !currentRound) {
      return [];
    }

    const socketBets = activeBets.filter((bet) => bet.userId === userId && bet.roundId === currentRound.id);
    const historyBets = myBetsQuery.data?.bets.filter((bet) => bet.roundId === currentRound.id) ?? [];

    return dedupeBets([...socketBets, ...historyBets]);
  }, [activeBets, currentRound, myBetsQuery.data?.bets, userId]);
  const roundResult = currentRound?.result ?? lastResult;
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
          const idempotencyKey = `ui:${currentRound!.id}:${choice}:${Date.now()}:${index}:${Math.random()
            .toString(36)
            .slice(2)}`;
          const input = {
            roundId: currentRound!.id,
            choice,
            coinsStaked: safeAmount,
            idempotencyKey,
          };
          const response = getActiveSocket()
            ? await placeBetOverSocket(input)
            : await placePrediction(token!, input);

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
      setNotice(`${response.bets.length} prediction${response.bets.length === 1 ? "" : "s"} placed`);
    },
    onError: (error) => {
      setConfirming(false);
      setNotice(error.message);
    },
  });

  const actionDisabled =
    !canPredict ||
    selectedForRound.length === 0 ||
    amountInvalid ||
    mutation.isPending ||
    safeQuantity <= 0;

  return (
    <AppShell title="Color Prediction">
      <section className="grid gap-3 pb-28">
        <section className="rounded-3xl border border-line bg-[linear-gradient(135deg,#ffffff,#f1faf4)] p-3 shadow-[0_10px_24px_rgba(23,32,26,0.07)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase text-muted">Current period</p>
              <h1 className="mt-0.5 truncate text-xl font-black tabular-nums text-ink sm:text-2xl">
                {currentRound?.roundNumber ?? "--"}
              </h1>
              <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${canPredict ? "bg-[#dff8e9] text-[#106b3d]" : "bg-[#fff3cd] text-[#8a5a00]"}`}>
                {showLockOverlay ? "Betting locked" : statusLabel(currentRound)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-black uppercase text-muted">Round timer</p>
              <CountdownBoxes remainingSeconds={roundRemainingSeconds} locked={showLockOverlay} />
            </div>
          </div>
        </section>

        <section className="grid gap-2 rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-ink">Pick a color</h2>
            </div>
            {selectedForRound.length > 0 ? (
              <span className="rounded-full bg-[#eef3ee] px-3 py-1 text-[10px] font-black uppercase text-ink">
                {selectedForRound[0]}
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
              <h2 className="text-base font-black">Stake</h2>
            </div>
            <p className="text-xs font-black text-muted">Balance {formatCoinString(wallet?.totalBalance)}</p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-6 gap-1.5">
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
                <span className="text-[10px] font-black uppercase text-muted">Custom</span>
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
              <span className="text-muted">Total stake</span>
              <span className={amountInvalid ? "text-[#991b1b]" : "text-ink"}>{formatCoinString(totalStake)}</span>
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
                  <span className="min-w-0 truncate font-black">{selectedForRound.join(", ")} x{safeQuantity}</span>
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
                {!canPredict
                  ? "Betting Locked"
                  : selectedForRound.length > 0
                    ? `Place ${selectedForRound.length * safeQuantity} Prediction${selectedForRound.length * safeQuantity === 1 ? "" : "s"}`
                    : "Place Prediction"}
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

function CountdownBoxes({ remainingSeconds, locked }: { remainingSeconds: number; locked: boolean }) {
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
            locked ? "bg-[#fff3cd] text-[#8a5a00]" : "bg-[#eef3ee] text-ink"
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
  const liveRows: OrderRow[] =
    tab === "everyone"
      ? everyoneBets.map((bet) => ({
          id: bet.id,
          user: maskUser(bet.userId),
          choice: bet.choice,
          amount: bet.coinsStaked,
          period: bet.roundId.slice(0, 6),
          outcome: getOrderOutcome(bet.status),
        }))
      : myBets.map((bet) => ({
          id: bet.id,
          user: maskUser(bet.userId),
          choice: bet.choice,
          amount: bet.coinsStaked,
          period: getBetPeriodLabel(bet),
          outcome: getOrderOutcome(bet.status),
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
      <div className="grid grid-cols-[1fr_0.8fr_0.8fr] gap-2 px-4 py-3 text-[11px] font-black uppercase text-muted">
        <span>{tab === "everyone" ? "User" : "Period"}</span>
        <span>Select</span>
        <span className="text-right">Point</span>
      </div>
      <div className="max-h-[178px] overflow-hidden px-4 pb-4">
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-[#f8faf7] px-3 py-4 text-center text-sm font-bold text-muted">
            {tab === "everyone" ? "No current round orders." : "Your orders will appear here."}
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
              className="grid grid-cols-[1fr_0.8fr_0.8fr] items-center gap-2 rounded-2xl bg-[#f8faf7] px-3 py-2 text-sm font-bold"
            >
              <span className="truncate text-muted">
                {tab === "everyone" ? order.user : order.period}
              </span>
              <span className="flex items-center gap-2">
                <ResultDot result={order.choice} small />
                {order.choice.slice(0, 1)}
              </span>
              <OrderAmount amount={order.amount} outcome={order.outcome} />
            </motion.div>
          ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}

function OrderAmount({ amount, outcome }: { amount: string | number; outcome: "WIN" | "LOSS" }) {
  const win = outcome === "WIN";

  return (
    <span className={`truncate text-right font-black tabular-nums ${win ? "text-[#106b3d]" : "text-[#991b1b]"}`}>
      {win ? "+" : "-"}{formatCoinString(amount)}
    </span>
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

function dedupeBets<TBet extends BetDto>(bets: TBet[]) {
  return bets.filter((bet, index, all) => all.findIndex((item) => item.id === bet.id) === index);
}

function getOrderOutcome(status: string): "WIN" | "LOSS" {
  return status === "WON" ? "WIN" : "LOSS";
}

interface OrderRow {
  id: string;
  user: string;
  period: string;
  choice: PredictionColor;
  amount: string | number;
  outcome: "WIN" | "LOSS";
}

const dummyOrders: OrderRow[] = [
  { id: "dummy-live-1", user: "***114", period: "#live", choice: "GREEN", amount: 50, outcome: "WIN" },
  { id: "dummy-live-2", user: "***821", period: "#live", choice: "RED", amount: 100, outcome: "LOSS" },
  { id: "dummy-live-3", user: "***309", period: "#live", choice: "VIOLET", amount: 20, outcome: "WIN" },
  { id: "dummy-live-4", user: "***640", period: "#live", choice: "GREEN", amount: 200, outcome: "LOSS" },
];

function getOutcome(
  result: string | null | undefined,
  bets: Array<Pick<BetDto, "choice">>,
): "WIN" | "LOSS" | "WAITING" {
  if (!result || bets.length === 0) {
    return "WAITING";
  }

  return bets.some((bet) => bet.choice === result) ? "WIN" : "LOSS";
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
