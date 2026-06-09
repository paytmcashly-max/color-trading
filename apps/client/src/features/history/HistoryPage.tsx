"use client";

import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { fetchLedger } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

export function HistoryPage() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const ledgerQuery = useQuery({
    queryKey: ["ledger-history"],
    queryFn: () => fetchLedger(token!),
    enabled: Boolean(token),
  });
  const entries = ledgerQuery.data?.entries ?? [];

  return (
    <AppShell title="History">
      <section className="grid gap-3">
        {entries.length === 0 ? (
          <Card>
            <p className="font-black">No activity yet</p>
            <p className="mt-1 text-sm text-muted">Round and wallet activity will appear here.</p>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black">{entry.type.replaceAll("_", " ")}</p>
                  <p className="text-sm text-muted">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-lg font-black">{entry.direction === "CREDIT" ? "+" : "-"}{entry.amountCoins}</p>
              </div>
            </Card>
          ))
        )}
      </section>
    </AppShell>
  );
}
