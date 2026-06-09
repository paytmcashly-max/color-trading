"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuthStore } from "@/store/auth-store";

export function AdminGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const tokens = useAuthStore((state) => state.tokens);

  if (!tokens || !user) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 text-ink">
        <Card className="mx-auto max-w-md">
          <p className="text-xs font-bold uppercase text-muted">Admin access</p>
          <h1 className="mt-2 text-2xl font-extrabold">Sign in required</h1>
          <p className="mt-2 text-sm text-muted">Admin routes require an authenticated operator session.</p>
          <Link href="/login" className="mt-4 block">
            <Button className="w-full">Sign in</Button>
          </Link>
        </Card>
      </main>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 text-ink">
        <Card className="mx-auto max-w-md border-[#f2c2c2] bg-[#fff7f7]">
          <p className="text-xs font-bold uppercase text-[#8d1f1f]">Blocked</p>
          <h1 className="mt-2 text-2xl font-extrabold">Admin role required</h1>
          <p className="mt-2 text-sm text-[#7b3333]">This control center is restricted to ADMIN users.</p>
          <Link href="/" className="mt-4 block">
            <Button variant="secondary" className="w-full">Return to app</Button>
          </Link>
        </Card>
      </main>
    );
  }

  return children;
}
