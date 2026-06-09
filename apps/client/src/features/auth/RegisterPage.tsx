"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { register } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { AuthLayout } from "./AuthLayout";

export function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => register(email.trim(), password, displayName.trim() || undefined),
    onSuccess: (response) => {
      setSession(response.user, response.tokens);
      router.push(getSafeNextPath(searchParams.get("next")));
    },
  });

  return (
    <AuthLayout
      title="Create account"
      subtitle="Create your player profile and start with virtual coins."
      footer={
        <>
          Already joined?{" "}
          <Link href="/login" className="font-black text-[#83ffc3]">
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label className="grid gap-2 text-sm font-bold text-white/78">
          Display name
          <input
            className="min-h-12 rounded-2xl border border-white/10 bg-black/25 px-3 text-white outline-none focus:border-[#83ffc3]"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="nickname"
            minLength={2}
            maxLength={80}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-white/78">
          Email
          <input
            className="min-h-12 rounded-2xl border border-white/10 bg-black/25 px-3 text-white outline-none focus:border-[#83ffc3]"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-white/78">
          Password
          <input
            className="min-h-12 rounded-2xl border border-white/10 bg-black/25 px-3 text-white outline-none focus:border-[#83ffc3]"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={6}
            maxLength={12}
            title="Use 6 to 12 characters."
            required
          />
        </label>
        <p className="text-xs font-semibold leading-5 text-white/45">
          Use 6 to 12 characters.
        </p>
        {mutation.error ? (
          <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm font-semibold text-[#991b1b]">
            {mutation.error.message}
          </p>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}
