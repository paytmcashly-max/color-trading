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
    <section className={`relative overflow-hidden rounded-3xl border border-line bg-white p-4 text-ink shadow-[0_14px_34px_rgba(23,32,26,0.08)] ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#16874f] via-[#21a67a] to-[#6e46b9]" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-normal text-muted">Total balance</p>
          <p className="mt-1 flex min-w-0 items-center gap-2 text-3xl font-black tracking-normal text-ink">
            <Coins size={24} className="shrink-0 text-[#16874f]" aria-hidden="true" />
            {isLoading && !wallet ? "..." : formatCoinString(wallet?.totalBalance)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#c8e9d5] bg-[#e9f8ef] px-2.5 py-1 text-[11px] font-black text-[#106b3d]">
          Virtual
        </span>
      </div>

      <div className="relative mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-muted">
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
    <div className="rounded-2xl border border-line bg-[#f8faf7] px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] font-black uppercase">{icon}{label}</span>
      <strong className="mt-1 block truncate text-base text-ink">{formatCoinString(value)}</strong>
    </div>
  );
}
