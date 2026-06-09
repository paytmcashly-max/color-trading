"use client";

import { CircleDollarSign, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { adjustAdminWallet, fetchAdminLedger, fetchAdminWallet } from "@/services/api-client";
import { useAdminToken } from "@/features/admin/useAdminToken";
import { formatCoinString } from "@/utils/format-coins";

export function AdminWalletsPage() {
  const token = useAdminToken();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [amountCoins, setAmountCoins] = useState(100);
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const enabled = Boolean(token && userId);
  const walletQuery = useQuery({
    queryKey: ["admin", "wallet", userId],
    queryFn: () => fetchAdminWallet(token, userId),
    enabled,
  });
  const ledgerQuery = useQuery({
    queryKey: ["admin", "ledger", userId],
    queryFn: () => fetchAdminLedger(token, userId),
    enabled,
  });
  const adjustment = useMutation({
    mutationFn: () =>
      adjustAdminWallet(token, userId, {
        amountCoins,
        direction,
        reason,
        confirmation: "ADJUST WALLET",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "wallet", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "ledger", userId] });
      setConfirmation("");
      setReason("");
    },
  });

  return (
    <AdminShell title="Wallets">
      <Card>
        <label className="flex min-h-12 items-center gap-2 rounded-md border border-line bg-white px-3">
          <Search size={18} aria-hidden="true" />
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="User id"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </Card>

      {walletQuery.data?.wallet ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <p className="text-xs font-bold uppercase text-muted">Wallet balance</p>
            <div className="mt-2 text-3xl font-extrabold">{formatCoinString(walletQuery.data.wallet.balanceCoins)}</div>
            <p className="mt-1 text-sm text-muted">Status: {walletQuery.data.wallet.status}</p>

            <div className="mt-5 grid gap-3">
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value as "CREDIT" | "DEBIT")}
                className="min-h-12 rounded-md border border-line px-3 text-sm font-bold"
              >
                <option value="CREDIT">Credit coins</option>
                <option value="DEBIT">Debit coins</option>
              </select>
              <input
                type="number"
                min={1}
                value={amountCoins}
                onChange={(event) => setAmountCoins(Number(event.target.value))}
                className="min-h-12 rounded-md border border-line px-3 text-sm"
              />
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Adjustment reason, min 8 characters"
                className="min-h-24 rounded-md border border-line px-3 py-3 text-sm outline-none"
              />
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Type ADJUST WALLET"
                className="min-h-12 rounded-md border border-line px-3 text-sm"
              />
              <Button
                variant={direction === "DEBIT" ? "danger" : "success"}
                disabled={confirmation !== "ADJUST WALLET" || reason.trim().length < 8 || amountCoins <= 0}
                onClick={() => adjustment.mutate()}
              >
                <CircleDollarSign size={16} /> Apply admin adjustment
              </Button>
            </div>
          </Card>

          <LedgerList entries={ledgerQuery.data?.entries ?? []} />
        </div>
      ) : null}
    </AdminShell>
  );
}

function LedgerList({ entries }: { entries: Array<{ id: string; type: string; direction: string; amountCoins: string; status: string; createdAt: string }> }) {
  return (
    <Card>
      <p className="text-xs font-bold uppercase text-muted">Ledger audit trail</p>
      <div className="mt-3 grid gap-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-md border border-line bg-[#f8fbf8] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-extrabold">{entry.type}</span>
              <span className="text-xs font-bold">{entry.status}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {entry.direction} {formatCoinString(entry.amountCoins)} | {new Date(entry.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
