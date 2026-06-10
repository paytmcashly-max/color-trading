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
    queryKey: ["my-bet-history", user?.id, { limit: 50 }],
    queryFn: () => fetchMyBetHistory(token!, { limit: 50 }),
    enabled: Boolean(token && user?.id),
  });
  const stats = buildStats(betsQuery.data?.bets ?? []);
  const avatar = (user?.displayName ?? user?.email ?? "P").slice(0, 1).toUpperCase();

  return (
    <AppShell title="Profile">
      <section className="rounded-3xl border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#16874f] to-[#6e46b9] text-2xl font-black text-white shadow-[0_10px_24px_rgba(22,135,79,0.16)]">
            {avatar}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-xl font-black text-ink">{user?.displayName ?? "Player"}</h2>
              <span className="shrink-0 rounded-full bg-[#e9f8ef] px-2 py-0.5 text-[10px] font-black uppercase text-[#106b3d]">
                {user?.role ?? "USER"}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm font-bold text-muted">{user?.email ?? "Not signed in"}</p>
            <p className="mt-1 text-[10px] font-black uppercase text-muted">ID {user?.id.slice(0, 10).toUpperCase() ?? "--"}</p>
          </div>
        </div>
      </section>

      <StatsCard stats={stats} />
      <WalletCard wallet={wallet} isLoading={isLoading} />

      <section className="grid gap-2 rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center justify-between">
          <h2 className="font-black">Settings</h2>
          <span className="rounded-full bg-[#eef3ee] px-2.5 py-1 text-[10px] font-black uppercase text-muted">
            Account
          </span>
        </div>
        <SettingRow icon={<Bell size={18} />} label="Notifications" value="Live alerts" />
        <SettingRow icon={<ShieldCheck size={18} />} label="Security" value={user?.role ?? "USER"} />
        <SettingRow icon={<SlidersHorizontal size={18} />} label="Preferences" value="Light mode" />
      </section>

      <button
        type="button"
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#fecaca] bg-[#fee2e2] text-sm font-black text-[#991b1b]"
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
    <section className="rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserRound size={18} className="text-[#16874f]" aria-hidden="true" />
          <h2 className="font-black">Statistics</h2>
        </div>
        <span className="rounded-full bg-[#eef3ee] px-2.5 py-1 text-[10px] font-black uppercase text-muted">
          Live
        </span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
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
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8faf7] px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink">
        <span className="text-muted">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-[10px] font-black uppercase text-muted">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-[#f8faf7] px-1.5 py-2 text-center">
      <p className="text-base font-black text-ink">{value}</p>
      <p className="mt-0.5 text-[9px] font-black uppercase text-muted">{label}</p>
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
