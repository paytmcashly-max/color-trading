"use client";

import { ArrowDownLeft, ArrowUpRight, RefreshCw, WalletCards } from "lucide-react";

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
      <WalletCard wallet={wallet} isLoading={isLoading} />

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
                <div className="flex items-center justify-between gap-3">
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
                  <div className="shrink-0 text-right">
                    <p className={`text-base font-black tabular-nums ${credit ? "text-[#106b3d]" : "text-[#991b1b]"}`}>
                      {credit ? "+" : "-"}{formatCoinString(transaction.amount)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-black uppercase text-muted">
                      Bal {formatCoinString(transaction.balanceAfter)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
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
