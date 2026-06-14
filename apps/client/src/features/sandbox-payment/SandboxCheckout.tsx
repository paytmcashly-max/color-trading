"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, FlaskConical, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  createPaymentIntent,
  fetchPaymentIntent,
  fetchPremiumCreditLedger,
  fetchPremiumCreditWallet,
} from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

export function SandboxCheckout() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const returnedIntentId = searchParams.get("intent_id");
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const userId = useAuthStore((state) => state.user?.id);
  const [amount, setAmount] = useState("100");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const walletQuery = useQuery({
    queryKey: ["premium-credit-wallet", userId],
    queryFn: () => fetchPremiumCreditWallet(token!),
    enabled: Boolean(token && userId),
  });
  const ledgerQuery = useQuery({
    queryKey: ["premium-credit-ledger", userId, { limit: 10 }],
    queryFn: () => fetchPremiumCreditLedger(token!, { limit: 10 }),
    enabled: Boolean(token && userId),
  });
  const intentQuery = useQuery({
    queryKey: ["payment-intent", userId, returnedIntentId],
    queryFn: () => fetchPaymentIntent(token!, returnedIntentId!),
    enabled: Boolean(token && userId && returnedIntentId),
    refetchInterval: (query) =>
      ["CREDITED", "FAILED", "EXPIRED"].includes(query.state.data?.intent.status ?? "")
        ? false
        : 2_000,
  });

  useEffect(() => {
    if (intentQuery.data?.intent.status === "CREDITED") {
      void queryClient.invalidateQueries({ queryKey: ["premium-credit-wallet", userId] });
      void queryClient.invalidateQueries({ queryKey: ["premium-credit-ledger", userId] });
    }
  }, [intentQuery.data?.intent.status, queryClient, userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const result = await createPaymentIntent(token, Number(amount) * 100, crypto.randomUUID());
      if (!result.intent.paymentUrl) throw new Error("Payment checkout URL is unavailable.");
      window.location.assign(result.intent.paymentUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start sandbox payment.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 text-ink">
      <div className="mx-auto grid max-w-lg gap-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-[#16874f]">Cashfree sandbox</p>
            <h1 className="text-2xl font-black">Premium credits</h1>
          </div>
          <span className="grid size-12 place-items-center rounded-2xl bg-[#e9f8ef] text-[#16874f]">
            <FlaskConical size={24} aria-hidden="true" />
          </span>
        </header>

        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase text-muted">Premium credit balance</p>
          <p className="mt-1 text-3xl font-black">{walletQuery.data?.wallet.balanceCredits ?? "0"}</p>
          <p className="mt-1 text-sm font-bold text-muted">Separate from game coins and unavailable for bets.</p>
        </section>

        {returnedIntentId ? (
          <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {intentQuery.data?.intent.status === "CREDITED" ? (
                <CheckCircle2 className="text-[#16874f]" size={22} />
              ) : (
                <LoaderCircle className="animate-spin text-[#16874f]" size={22} />
              )}
              <div>
                <p className="font-black">Backend verification</p>
                <p className="text-sm font-bold text-muted">
                  {message ||
                    (intentQuery.data?.intent.status === "CREDITED"
                      ? "Payment verified and premium credits added."
                      : `Status: ${intentQuery.data?.intent.status ?? "checking"}`)}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <form className="grid gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm" onSubmit={submit}>
            <label className="grid gap-1.5 text-sm font-black">
              Amount (INR)
              <input
                className="h-12 rounded-xl border border-line bg-[#f8faf7] px-3 outline-none focus:border-[#16874f]"
                type="number"
                min="10"
                max="10000"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <p className="text-sm font-bold text-muted">₹1 = 1 premium credit</p>
            {message ? <p className="text-sm font-bold text-[#991b1b]">{message}</p> : null}
            <button
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#16874f] px-4 font-black text-white disabled:opacity-60"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? <LoaderCircle className="animate-spin" size={19} /> : <CreditCard size={19} />}
              Open sandbox checkout
            </button>
          </form>
        )}

        <section className="rounded-2xl border border-[#f5d28a] bg-[#fff8e7] p-4 text-sm font-bold text-[#73510d]">
          <div className="flex gap-2">
            <ShieldCheck className="shrink-0" size={20} />
            <p>A return redirect never credits your account. Credits appear only after signed backend verification.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="font-black">Recent premium credits</h2>
          <div className="mt-3 grid gap-2">
            {(ledgerQuery.data?.entries ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-xl bg-[#f8faf7] px-3 py-2">
                <span className="text-sm font-bold text-muted">{new Date(entry.createdAt).toLocaleString()}</span>
                <strong className="text-[#16874f]">+{entry.credits}</strong>
              </div>
            ))}
            {!ledgerQuery.data?.entries.length ? <p className="text-sm font-bold text-muted">No premium credits yet.</p> : null}
          </div>
        </section>

        <Link className="text-center text-sm font-black text-[#16874f]" href="/wallet">Back to wallet</Link>
      </div>
    </main>
  );
}
