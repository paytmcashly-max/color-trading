"use client";

import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { fetchMyBetHistory } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { formatCoinString } from "@/utils/format-coins";

export function HistoryPage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const userId = useAuthStore((state) => state.user?.id);
  const betsQuery = useQuery({
    queryKey: ["my-bet-history", userId, { limit: 50 }],
    queryFn: () => fetchMyBetHistory(token!, { limit: 50 }),
    enabled: Boolean(token && userId),
    refetchInterval: 20_000,
  });
  const bets = betsQuery.data?.bets ?? [];

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
            <article key={bet.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-line bg-[#f8faf7] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <ResultBadge result={bet.choice} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-ink">
                    #{bet.round?.roundNumber ?? bet.roundId.slice(0, 6)} | {bet.choice}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-muted">
                    Result {bet.result ?? bet.round?.result ?? "--"} | Stake {formatCoinString(bet.coinsStaked)} | Payout {formatCoinString(bet.payoutAmount)} | Net {formatNet(bet.netProfitLoss)}
                  </p>
                </div>
              </div>
              <OutcomePill status={bet.status} />
            </article>
          ))}
        </div>
      </section>

    </AppShell>
  );
}

function OutcomePill({ status }: { status: string }) {
  const className =
    status === "WON"
      ? "bg-[#dff8e9] text-[#106b3d]"
      : status === "LOST"
        ? "bg-[#fee2e2] text-[#991b1b]"
        : status === "CANCELLED"
          ? "bg-[#eef1ef] text-muted"
          : "bg-[#fff3cd] text-[#8a5a00]";

  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${className}`}>{status === "CANCELLED" ? "REFUNDED" : status}</span>;
}

function formatNet(value: string | null | undefined) {
  if (value === null || value === undefined) return "Pending";
  const amount = Number(value);
  return `${amount > 0 ? "+" : ""}${formatCoinString(value)}`;
}

function ResultBadge({ result }: { result: string | null }) {
  const className =
    result === "GREEN"
      ? "bg-[#16a34a]"
      : result === "RED"
        ? "bg-[#ef4444]"
        : result === "VIOLET"
          ? "bg-[#8b5cf6]"
          : "bg-[#dfe6df]";

  return (
    <span className={`grid size-7 shrink-0 place-items-center rounded-full ${className} text-[10px] font-black text-white shadow-sm`}>
      {result?.slice(0, 1) ?? "--"}
    </span>
  );
}
