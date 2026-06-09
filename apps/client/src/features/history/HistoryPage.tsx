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
      <section className="rounded-[28px] border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-[#5dffae]" aria-hidden="true" />
          <h2 className="font-black">Game history</h2>
        </div>
        <div className="mt-4 grid gap-3">
          {betsQuery.isLoading ? <p className="text-sm font-bold text-muted">Loading predictions...</p> : null}
          {!betsQuery.isLoading && bets.length === 0 ? (
            <p className="text-sm font-bold text-muted">Your predictions will appear here.</p>
          ) : null}
          {bets.map((bet) => (
            <article key={bet.id} className="rounded-[26px] border border-line bg-canvas p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-muted">
                    Round #{bet.round?.roundNumber ?? bet.roundId.slice(0, 8)}
                  </p>
                  <h3 className="mt-1 text-xl font-black text-ink">{bet.choice}</h3>
                </div>
                <OutcomePill status={bet.status} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniMetric label="Result" value={bet.round?.result ?? "--"} />
                <MiniMetric label="Amount" value={formatCoinString(bet.coinsStaked)} />
                <MiniMetric label="Payout" value={formatCoinString(bet.payoutAmount)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center gap-2">
          <Clock3 size={18} className="text-[#ffc857]" aria-hidden="true" />
          <h2 className="font-black">Round results</h2>
        </div>
        <div className="mt-4 grid gap-3">
          {roundsQuery.isLoading ? <p className="text-sm font-bold text-muted">Loading rounds...</p> : null}
          {!roundsQuery.isLoading && rounds.length === 0 ? (
            <p className="text-sm font-bold text-muted">Completed rounds will appear here.</p>
          ) : null}
          {rounds.map((round) => (
            <article key={round.id} className="flex items-center justify-between rounded-[24px] border border-line bg-canvas p-4">
              <div>
                <p className="font-black text-ink">Round #{round.roundNumber}</p>
                <p className="mt-1 text-xs font-bold text-muted">
                  {round.betCount} predictions | {new Date(round.endTime).toLocaleString()}
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
    <div className="rounded-2xl bg-white p-3 text-center">
      <p className="text-sm font-black text-ink">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase text-muted">{label}</p>
    </div>
  );
}

function OutcomePill({ status }: { status: string }) {
  const className =
    status === "WON"
      ? "bg-[#1fd87a]/18 text-[#77ffc0]"
      : status === "LOST"
        ? "bg-[#ff3b4f]/18 text-[#ff98a4]"
        : "bg-[#ffc857]/15 text-[#ffd477]";

  return <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>{status}</span>;
}

function ResultBadge({ result }: { result: string | null }) {
  const className =
    result === "GREEN"
      ? "bg-[#19d879] shadow-[0_0_20px_rgba(25,216,121,0.45)]"
      : result === "RED"
        ? "bg-[#ff3b4f] shadow-[0_0_20px_rgba(255,59,79,0.45)]"
        : result === "VIOLET"
          ? "bg-[#9b5cff] shadow-[0_0_20px_rgba(155,92,255,0.45)]"
          : "bg-[#dfe6df]";

  return (
    <span className={`grid size-12 place-items-center rounded-full ${className} text-[10px] font-black text-white`}>
      {result?.slice(0, 1) ?? "--"}
    </span>
  );
}
