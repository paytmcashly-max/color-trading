"use client";

import { Trophy } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";

const rows = [
  { name: "Avery", coins: "12,430", change: "+4" },
  { name: "Mina", coins: "10,880", change: "+2" },
  { name: "Dev", coins: "9,610", change: "+1" },
];

export function LeaderboardPage() {
  return (
    <AppShell title="Leaderboard">
      <Card>
        <div className="flex items-center gap-3">
          <Trophy size={24} aria-hidden="true" />
          <div>
            <p className="font-black">Top virtual coin balances</p>
            <p className="text-sm text-muted">Live ranking endpoint can plug into this list.</p>
          </div>
        </div>
      </Card>
      <section className="grid gap-3">
        {rows.map((row, index) => (
          <Card key={row.name}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-ink font-black text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="font-black">{row.name}</p>
                  <p className="text-sm text-muted">{row.change} today</p>
                </div>
              </div>
              <p className="text-lg font-black">{row.coins}</p>
            </div>
          </Card>
        ))}
      </section>
    </AppShell>
  );
}
