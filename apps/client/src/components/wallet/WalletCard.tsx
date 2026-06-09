"use client";

import { Coins, Landmark, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import type { WalletDto } from "@/types/api";
import { formatCoinString } from "@/utils/format-coins";

export function WalletCard({
  wallet,
  isLoading = false,
  className = "",
}: {
  wallet: WalletDto | null;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <section className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(37,43,73,0.92),rgba(16,18,35,0.96)_45%,rgba(25,85,58,0.88))] p-5 text-white shadow-[0_22px_70px_rgba(0,0,0,0.35)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.20),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(34,226,127,0.25),transparent_34%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-white/50">Total balance</p>
          <p className="mt-2 flex items-center gap-2 text-4xl font-black tracking-normal text-white">
            <Coins size={28} aria-hidden="true" />
            {isLoading && !wallet ? "..." : formatCoinString(wallet?.totalBalance)}
          </p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black text-[#a7ffd0] backdrop-blur">
          Virtual
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 text-xs font-bold text-white/60">
        <BalanceTile
          icon={<Landmark size={18} aria-hidden="true" />}
          label="Deposit"
          value={wallet?.depositBalance}
        />
        <BalanceTile
          icon={<Trophy size={18} aria-hidden="true" />}
          label="Winning"
          value={wallet?.winningBalance}
        />
      </div>
    </section>
  );
}

function BalanceTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-3 backdrop-blur">
      <span className="flex items-center gap-2">{icon}{label}</span>
      <strong className="mt-1 block text-base text-white">{formatCoinString(value)}</strong>
    </div>
  );
}
