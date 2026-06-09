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
    <section className={`relative overflow-hidden rounded-[28px] border border-[#cfe7d9] bg-[linear-gradient(135deg,#ffffff,#f0fbf5_48%,#edf0ff)] p-5 shadow-[0_18px_50px_rgba(23,32,26,0.12)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(22,135,79,0.16),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(110,70,185,0.14),transparent_34%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-normal text-muted">Total balance</p>
          <p className="mt-2 flex items-center gap-2 text-4xl font-black tracking-normal text-ink">
            <Coins size={28} aria-hidden="true" />
            {isLoading && !wallet ? "..." : formatCoinString(wallet?.totalBalance)}
          </p>
        </div>
        <span className="rounded-full border border-[#bee8d0] bg-[#e5f8ee] px-3 py-1 text-xs font-black text-[#16874f] backdrop-blur">
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
    <div className="rounded-2xl border border-line bg-white/80 p-3 backdrop-blur">
      <span className="flex items-center gap-2">{icon}{label}</span>
      <strong className="mt-1 block text-base text-ink">{formatCoinString(value)}</strong>
    </div>
  );
}
