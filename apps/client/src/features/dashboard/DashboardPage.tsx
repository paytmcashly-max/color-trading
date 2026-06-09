"use client";

import { ArrowRight, Clock3, Coins, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchCurrentRound, fetchWallet } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import { formatCoinString } from "@/utils/format-coins";

export function DashboardPage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const currentRound = useGameStore((state) => state.currentRound);
  const wallet = useGameStore((state) => state.wallet);
  const setRound = useGameStore((state) => state.setRound);
  const setWallet = useGameStore((state) => state.setWallet);

  const roundQuery = useQuery({
    queryKey: ["current-round"],
    queryFn: fetchCurrentRound,
  });
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

  return (
    <AppShell title="Dashboard">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-muted">Wallet balance</p>
              <div className="mt-2 flex items-center gap-2 text-3xl font-black">
                <Coins size={28} aria-hidden="true" />
                {formatCoinString(wallet?.totalBalance)}
              </div>
              <p className="mt-2 text-xs font-semibold text-muted">
                Deposit {formatCoinString(wallet?.depositBalance)} | Winning {formatCoinString(wallet?.winningBalance)}
              </p>
            </div>
            <span className="rounded-full bg-[#dff4e8] px-3 py-1 text-xs font-black text-[#0f5b38]">
              Virtual
            </span>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-bold text-muted">Current round</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-black">#{currentRound?.roundNumber ?? "--"}</p>
              <p className="mt-1 text-xs font-semibold text-muted">Live prediction window</p>
            </div>
            {currentRound ? <StatusBadge status={currentRound.status} /> : null}
          </div>
        </Card>
      </section>

      <Link
        href="/game"
        className="flex min-h-20 items-center justify-between rounded-md bg-ink px-4 text-white shadow-sm"
      >
        <span className="flex items-center gap-3 text-base font-black">
          <Gamepad2 size={24} aria-hidden="true" />
          Join active round
        </span>
        <ArrowRight size={24} aria-hidden="true" />
      </Link>

      <Card>
        <div className="flex items-center gap-3">
          <Clock3 size={22} aria-hidden="true" />
          <div>
            <p className="font-black">Round timing</p>
            <p className="text-sm text-muted">Predictions stay open for 45 seconds, then lock before result sync.</p>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
