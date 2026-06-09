"use client";

import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { fetchLeaderboard } from "@/services/api-client";
import { formatCoinString } from "@/utils/format-coins";

export function LeaderboardPage() {
  const leaderboard = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 20_000,
  });
  const users = leaderboard.data?.users ?? [];

  return (
    <AppShell title="Leaderboard">
      <Card>
        <div className="flex items-center gap-3">
          <Trophy size={24} aria-hidden="true" />
          <div>
            <p className="font-black">Top virtual coin balances</p>
            <p className="text-sm text-muted">Live ranking from active wallet balances.</p>
          </div>
        </div>
      </Card>
      <section className="grid gap-3">
        {leaderboard.isLoading ? <Card>Loading leaderboard...</Card> : null}
        {!leaderboard.isLoading && users.length === 0 ? (
          <Card>
            <p className="font-black">No ranked users yet</p>
            <p className="mt-1 text-sm text-muted">Players appear here after wallet creation.</p>
          </Card>
        ) : null}
        {users.map((row) => (
          <Card key={row.userId}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-ink font-black text-white">
                  {row.rank}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-black">{row.displayName ?? maskEmail(row.email)}</p>
                  <p className="text-sm text-muted">
                    Winning {formatCoinString(row.winningBalance)}
                  </p>
                </div>
              </div>
              <p className="text-lg font-black">{formatCoinString(row.totalBalance)}</p>
            </div>
          </Card>
        ))}
      </section>
    </AppShell>
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) {
    return "Player";
  }

  return `${name.slice(0, 2)}***@${domain}`;
}
