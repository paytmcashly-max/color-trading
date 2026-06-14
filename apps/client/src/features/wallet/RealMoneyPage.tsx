"use client";

import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { fetchRealMoneyBets, fetchRealMoneyDeposits, fetchRealMoneyEligibility, fetchRealMoneyLedger, fetchRealMoneyWallet, fetchRealMoneyWithdrawals } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

export function RealMoneyPage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const userId = useAuthStore((state) => state.user?.id);
  const eligibility = useQuery({
    queryKey: ["real-money-eligibility", userId],
    queryFn: () => fetchRealMoneyEligibility(token!),
    enabled: Boolean(token && userId),
  });
  const enabled = eligibility.data?.eligible === true;
  const wallet = useQuery({
    queryKey: ["real-money-wallet", userId],
    queryFn: () => fetchRealMoneyWallet(token!),
    enabled: Boolean(token && userId && enabled),
  });
  const ledger = useQuery({
    queryKey: ["real-money-ledger", userId],
    queryFn: () => fetchRealMoneyLedger(token!, { limit: 20 }),
    enabled: Boolean(token && userId && enabled),
  });
  const deposits = useQuery({
    queryKey: ["real-money-deposits", userId],
    queryFn: () => fetchRealMoneyDeposits(token!, { limit: 10 }),
    enabled: Boolean(token && userId && enabled),
  });
  const withdrawals = useQuery({
    queryKey: ["real-money-withdrawals", userId],
    queryFn: () => fetchRealMoneyWithdrawals(token!, { limit: 10 }),
    enabled: Boolean(token && userId && enabled),
  });
  const bets = useQuery({
    queryKey: ["real-money-bets", userId],
    queryFn: () => fetchRealMoneyBets(token!, { limit: 10 }),
    enabled: Boolean(token && userId && enabled),
  });

  return (
    <AppShell title="Sandbox wallet">
      <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-[#fff4d8] text-[#8a5b00]"><ShieldCheck size={21} /></span>
          <div>
            <h2 className="font-black">Compliance-gated sandbox</h2>
            <p className="text-xs font-bold text-muted">Separate from practice coins and premium credits.</p>
          </div>
        </div>
        {!enabled ? (
          <div className="mt-4 rounded-xl bg-[#f2f4f1] p-3 text-sm font-bold text-muted">
            <LockKeyhole className="mb-2" size={18} />
            This mode is unavailable. {friendlyReasons(eligibility.data?.reasons).join(" ")}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Balance label="Available" value={wallet.data?.wallet.availablePaise} />
            <Balance label="Locked" value={wallet.data?.wallet.lockedPaise} />
          </div>
        )}
      </section>

      {enabled ? (
        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="font-black">Sandbox activity</h2>
          <div className="mt-3 grid gap-2">
            {(ledger.data?.entries ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-xl bg-[#f7f9f6] px-3 py-2">
                <span className="text-sm font-bold">{label(entry.type)}</span>
                <span className="font-black tabular-nums">{formatPaise(entry.amountPaise)}</span>
              </div>
            ))}
            {!ledger.isLoading && !ledger.data?.entries.length ? <p className="text-sm font-bold text-muted">No sandbox activity.</p> : null}
          </div>
        </section>
      ) : null}

      {enabled ? <Activity title="Deposits" rows={(deposits.data?.deposits ?? []).map((item) => ({ id: item.id, label: statusLabel(item.status), value: formatPaise(item.amountPaise) }))} /> : null}
      {enabled ? <Activity title="Withdrawals" rows={(withdrawals.data?.withdrawals ?? []).map((item) => ({ id: item.id, label: statusLabel(item.status), value: formatPaise(item.amountPaise) }))} /> : null}
      {enabled ? <Activity title="Sandbox bets" rows={(bets.data?.bets ?? []).map((item) => ({ id: item.id, label: `${item.choice} · ${statusLabel(item.status)}`, value: formatPaise(item.stakePaise) }))} /> : null}
    </AppShell>
  );
}

function Balance({ label: text, value = "0" }: { label: string; value?: string }) {
  return <div className="rounded-xl bg-[#f7f9f6] p-3"><p className="text-xs font-black uppercase text-muted">{text}</p><p className="mt-1 text-xl font-black">{formatPaise(value)}</p></div>;
}
function formatPaise(value: string) { return `₹${(Number(value) / 100).toFixed(2)}`; }
function label(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()); }
function friendlyReasons(reasons: string[] = []) {
  if (reasons.some((reason) => reason.startsWith("GLOBAL_"))) return ["Global compliance gates are closed."];
  return reasons.map((reason) => label(reason) + ".");
}
function statusLabel(value: string) {
  const labels: Record<string, string> = {
    INTENT_CREATED: "Waiting for payment verification",
    PAID_VERIFIED: "Payment verified",
    CREDITED: "Credited",
    REQUESTED: "Under review",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    PAID: "Marked paid",
    PENDING: "Waiting for result",
    WON: "Won",
    LOST: "Lost",
    REFUNDED: "Refunded",
  };
  return labels[value] ?? label(value);
}
function Activity({ title, rows }: { title: string; rows: Array<{ id: string; label: string; value: string }> }) {
  return <section className="rounded-2xl border border-line bg-white p-4 shadow-sm"><h2 className="font-black">{title}</h2><div className="mt-3 grid gap-2">{rows.map((row) => <div key={row.id} className="flex items-center justify-between rounded-xl bg-[#f7f9f6] px-3 py-2"><span className="text-sm font-bold">{row.label}</span><span className="font-black tabular-nums">{row.value}</span></div>)}{rows.length === 0 ? <p className="text-sm font-bold text-muted">No activity.</p> : null}</div></section>;
}
