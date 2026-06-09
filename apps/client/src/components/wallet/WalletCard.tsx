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
    <section className={`relative overflow-hidden rounded-3xl border border-line bg-white p-5 text-ink shadow-[0_18px_48px_rgba(23,32,26,0.10)] ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#16874f] via-[#21a67a] to-[#6e46b9]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-muted">Total balance</p>
          <p className="mt-2 flex items-center gap-2 text-4xl font-black tracking-normal text-ink">
            <Coins size={28} aria-hidden="true" />
            {isLoading && !wallet ? "..." : formatCoinString(wallet?.totalBalance)}
          </p>
        </div>
        <span className="rounded-full border border-[#c8e9d5] bg-[#e9f8ef] px-3 py-1 text-xs font-black text-[#106b3d]">
          Virtual
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 text-xs font-bold text-muted">
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
    <div className="rounded-2xl border border-line bg-[#f8faf7] p-3">
      <span className="flex items-center gap-2">{icon}{label}</span>
      <strong className="mt-1 block text-base text-ink">{formatCoinString(value)}</strong>
    </div>
  );
}
