"use client";

import { ArrowDownLeft, ArrowUpRight, Coins, RefreshCw, WalletCards } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { WalletCard } from "@/components/wallet/WalletCard";
import { useWallet } from "@/hooks/useWallet";
import { formatCoinString } from "@/utils/format-coins";

export function WalletPage() {
  const { wallet, transactions, isLoading, isTransactionsLoading, refetch } = useWallet();

  return (
    <AppShell
      title="Wallet"
      action={
        <button
          type="button"
          className="grid size-10 place-items-center rounded-full border border-line bg-white text-ink shadow-sm active:scale-95"
          onClick={() => void refetch()}
          aria-label="Refresh wallet"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      }
    >
      <section className="grid gap-3">
        <WalletCard wallet={wallet} isLoading={isLoading} />
        <div className="grid grid-cols-3 gap-2">
          <WalletMiniStat label="Deposit" value={wallet?.depositBalance} />
          <WalletMiniStat label="Winning" value={wallet?.winningBalance} />
          <WalletMiniStat label="Total" value={wallet?.totalBalance} strong />
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-white p-3 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WalletCards size={18} className="text-[#16874f]" aria-hidden="true" />
            <h2 className="font-black">Transaction history</h2>
          </div>
          <span className="rounded-full bg-[#eef3ee] px-2.5 py-1 text-[10px] font-black uppercase text-muted">
            {transactions.length} rows
          </span>
        </div>
        <div className="mt-3 grid gap-2">
          {isTransactionsLoading ? (
            <p className="text-sm font-bold text-muted">Loading transactions...</p>
          ) : null}
          {!isTransactionsLoading && transactions.length === 0 ? (
            <p className="text-sm font-bold text-muted">Wallet activity will appear here.</p>
          ) : null}
          {transactions.map((transaction) => {
            const credit = isCredit(transaction.type, transaction.balanceBefore, transaction.balanceAfter);
            const Icon = credit ? ArrowDownLeft : ArrowUpRight;

            return (
              <article
                key={transaction.id}
                className="rounded-2xl border border-line bg-[#f8faf7] px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-full ${credit ? "bg-[#dff8e9] text-[#106b3d]" : "bg-[#fee2e2] text-[#991b1b]"}`}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">{formatTransactionType(transaction.type)}</p>
                      <p className="mt-0.5 text-[11px] font-bold text-muted">
                        {formatTransactionDate(transaction.createdAt)}
                      </p>
                    </div>
                  </div>
                  <p className={`shrink-0 text-right text-xl font-black tabular-nums ${credit ? "text-[#106b3d]" : "text-[#991b1b]"}`}>
                    {credit ? "+" : "-"}{formatCoinString(transaction.amount)}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <BalanceChip label="Before" value={transaction.balanceBefore} />
                  <BalanceChip label="After" value={transaction.balanceAfter} highlight={credit} />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function WalletMiniStat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | number | null | undefined;
  strong?: boolean;
}) {
  return (
    <div className={`rounded-2xl border px-3 py-2 ${strong ? "border-[#c8e9d5] bg-[#e9f8ef]" : "border-line bg-white"}`}>
      <p className="text-[10px] font-black uppercase text-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 text-sm font-black text-ink">
        <Coins size={13} className={strong ? "text-[#16874f]" : "text-muted"} aria-hidden="true" />
        <span className="truncate">{formatCoinString(value)}</span>
      </p>
    </div>
  );
}

function BalanceChip({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl px-2.5 py-2 ${highlight ? "bg-white" : "bg-[#eef3ee]"}`}>
      <p className="text-[10px] font-black uppercase text-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-ink">{formatCoinString(value)}</p>
    </div>
  );
}

function formatTransactionType(type: string) {
  return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTransactionDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isCredit(type: string, before: string, after: string) {
  if (type === "DEPOSIT" || type === "WIN") {
    return true;
  }

  if (type === "BET" || type === "LOSS") {
    return false;
  }

  return Number(after) >= Number(before);
}
