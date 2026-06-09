"use client";

import { Clock3, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { fetchMyBetHistory, fetchRoundHistory } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { formatCoinString } from "@/utils/format-coins";

export function HistoryPage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const roundsQuery = useQuery({
    queryKey: ["round-history"],
    queryFn: fetchRoundHistory,
    refetchInterval: 20_000,
  });
  const betsQuery = useQuery({
    queryKey: ["my-bet-history"],
    queryFn: () => fetchMyBetHistory(token!),
    enabled: Boolean(token),
    refetchInterval: 20_000,
  });
  const bets = betsQuery.data?.bets ?? [];
  const rounds = roundsQuery.data?.rounds ?? [];

  return (
    <AppShell title="History">
      <section className="rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-[#16874f]" aria-hidden="true" />
            <h2 className="font-black">Game history</h2>
          </div>
          <span className="rounded-full bg-[#eef3ee] px-2.5 py-1 text-[10px] font-black uppercase text-muted">
            {bets.length} bets
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          {betsQuery.isLoading ? <p className="text-sm font-bold text-muted">Loading predictions...</p> : null}
          {!betsQuery.isLoading && bets.length === 0 ? (
            <p className="text-sm font-bold text-muted">Your predictions will appear here.</p>
          ) : null}
          {bets.map((bet) => (
            <article key={bet.id} className="rounded-2xl border border-line bg-[#f8faf7] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black uppercase text-muted">
                    Round #{bet.round?.roundNumber ?? bet.roundId.slice(0, 8)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <ResultBadge result={bet.choice} small />
                    <h3 className="text-base font-black text-ink">{bet.choice}</h3>
                    <span className="text-xs font-bold text-muted">picked</span>
                  </div>
                </div>
                <OutcomePill status={bet.status} />
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <MiniMetric label="Result" value={bet.round?.result ?? "--"} />
                <MiniMetric label="Amount" value={formatCoinString(bet.coinsStaked)} />
                <MiniMetric label="Payout" value={formatCoinString(bet.payoutAmount)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-[#ffc857]" aria-hidden="true" />
            <h2 className="font-black">Round results</h2>
          </div>
          <span className="rounded-full bg-[#eef3ee] px-2.5 py-1 text-[10px] font-black uppercase text-muted">
            Live log
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          {roundsQuery.isLoading ? <p className="text-sm font-bold text-muted">Loading rounds...</p> : null}
          {!roundsQuery.isLoading && rounds.length === 0 ? (
            <p className="text-sm font-bold text-muted">Completed rounds will appear here.</p>
          ) : null}
          {rounds.map((round) => (
            <article key={round.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-[#f8faf7] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-ink">Round #{round.roundNumber}</p>
                <p className="mt-0.5 truncate text-[11px] font-bold text-muted">
                  {round.betCount} predictions · {formatHistoryDate(round.endTime)}
                </p>
              </div>
              <ResultBadge result={round.result} />
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2 text-center">
      <p className="truncate text-sm font-black text-ink">{value}</p>
      <p className="mt-0.5 text-[9px] font-black uppercase text-muted">{label}</p>
    </div>
  );
}

function OutcomePill({ status }: { status: string }) {
  const className =
    status === "WON"
      ? "bg-[#dff8e9] text-[#106b3d]"
      : status === "LOST"
        ? "bg-[#fee2e2] text-[#991b1b]"
        : "bg-[#fff3cd] text-[#8a5a00]";

  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${className}`}>{status}</span>;
}

function ResultBadge({ result, small = false }: { result: string | null; small?: boolean }) {
  const className =
    result === "GREEN"
      ? "bg-[#16a34a]"
      : result === "RED"
        ? "bg-[#ef4444]"
        : result === "VIOLET"
          ? "bg-[#8b5cf6]"
          : "bg-[#dfe6df]";

  return (
    <span className={`grid ${small ? "size-8" : "size-10"} shrink-0 place-items-center rounded-full ${className} text-[10px] font-black text-white shadow-sm`}>
      {result?.slice(0, 1) ?? "--"}
    </span>
  );
}

function formatHistoryDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
