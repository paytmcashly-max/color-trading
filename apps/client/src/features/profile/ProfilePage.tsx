"use client";

import { LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { logout } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";
import { formatCoinString } from "@/utils/format-coins";

export function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const clearSession = useAuthStore((state) => state.clearSession);
  const wallet = useGameStore((state) => state.wallet);

  return (
    <AppShell title="Profile">
      <Card>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-md bg-ink text-white">
            <UserRound size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-black">{user?.displayName ?? "Player"}</p>
            <p className="text-sm text-muted">{user?.email ?? "Not signed in"}</p>
          </div>
        </div>
      </Card>
      <Card>
        <p className="text-sm font-bold text-muted">Wallet summary</p>
        <p className="mt-2 text-3xl font-black">{formatCoinString(wallet?.balanceCoins)}</p>
      </Card>
      <Button
        variant="secondary"
        onClick={async () => {
          if (token) {
            await logout(token).catch(() => undefined);
          }
          clearSession();
          router.push("/login");
        }}
      >
        <LogOut size={18} aria-hidden="true" />
        Logout
      </Button>
    </AppShell>
  );
}
