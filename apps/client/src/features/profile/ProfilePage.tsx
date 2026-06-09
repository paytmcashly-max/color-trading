"use client";

import { Bell, LogOut, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { WalletCard } from "@/components/wallet/WalletCard";
import { useWallet } from "@/hooks/useWallet";
import { fetchMyBetHistory, logout } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import type { UserBetHistoryDto } from "@/types/api";

export function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const clearSession = useAuthStore((state) => state.clearSession);
  const { wallet, isLoading } = useWallet();
  const betsQuery = useQuery({
    queryKey: ["my-bet-history"],
    queryFn: () => fetchMyBetHistory(token!),
    enabled: Boolean(token),
  });
  const stats = buildStats(betsQuery.data?.bets ?? []);
  const avatar = (user?.displayName ?? user?.email ?? "P").slice(0, 1).toUpperCase();

  return (
    <AppShell title="Profile">
      <section className="rounded-[32px] border border-line bg-white p-5 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center gap-4">
          <span className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-[#1fd87a] to-[#8b5cf6] text-3xl font-black text-white shadow-[0_0_36px_rgba(31,216,122,0.28)]">
            {avatar}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black text-ink">{user?.displayName ?? "Player"}</h2>
            <p className="mt-1 truncate text-sm font-bold text-muted">{user?.email ?? "Not signed in"}</p>
            <p className="mt-2 text-xs font-black uppercase text-muted">ID {user?.id.slice(0, 12).toUpperCase() ?? "--"}</p>
          </div>
        </div>
      </section>

      <StatsCard stats={stats} />
      <WalletCard wallet={wallet} isLoading={isLoading} />

      <section className="grid gap-3 rounded-[28px] border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <h2 className="font-black">Settings</h2>
        <SettingRow icon={<Bell size={18} />} label="Notifications" value="Live alerts" />
        <SettingRow icon={<ShieldCheck size={18} />} label="Security" value={user?.role ?? "USER"} />
        <SettingRow icon={<SlidersHorizontal size={18} />} label="Preferences" value="Light mode" />
      </section>

      <button
        type="button"
        className="flex min-h-14 items-center justify-center gap-2 rounded-[24px] border border-[#ff3b4f]/25 bg-[#ff3b4f]/12 text-sm font-black text-[#ff98a4]"
        onClick={async () => {
          if (token) {
            await logout(token).catch(() => undefined);
          }
          clearSession();
          router.push("/login");
        }}
      >
        <LogOut size={18} aria-hidden="true" />
        Logout
      </button>
    </AppShell>
  );
}

function StatsCard({ stats }: { stats: ReturnType<typeof buildStats> }) {
  return (
    <section className="rounded-[28px] border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
      <div className="flex items-center gap-2">
        <UserRound size={18} className="text-[#5dffae]" aria-hidden="true" />
        <h2 className="font-black">Statistics</h2>
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

function SettingRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3">
      <span className="flex items-center gap-3 font-bold text-ink">
        <span className="text-muted">{icon}</span>
        {label}
      </span>
      <span className="text-xs font-black uppercase text-muted">{value}</span>
    </div>
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
