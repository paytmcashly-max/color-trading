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

      <section className="rounded-[28px] border border-line bg-white p-4 shadow-[0_12px_28px_rgba(23,32,26,0.07)]">
        <div className="flex items-center gap-2">
          <WalletCards size={18} className="text-[#5dffae]" aria-hidden="true" />
          <h2 className="font-black">Transaction history</h2>
        </div>
        <div className="mt-4 grid gap-3">
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
                className="rounded-[24px] border border-line bg-canvas p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-full ${credit ? "bg-[#1fd87a]/18 text-[#77ffc0]" : "bg-[#ff3b4f]/18 text-[#ff98a4]"}`}>
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-ink">{transaction.type.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs font-bold text-muted">
                        {new Date(transaction.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <p className={`text-lg font-black ${credit ? "text-[#77ffc0]" : "text-[#ff98a4]"}`}>
                    {credit ? "+" : "-"}{formatCoinString(transaction.amount)}
                  </p>
                </div>
                <p className="mt-3 text-xs font-bold text-muted">
                  {formatCoinString(transaction.balanceBefore)} -&gt; {formatCoinString(transaction.balanceAfter)}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
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
