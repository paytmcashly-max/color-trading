"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { register } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { AuthLayout } from "./AuthLayout";

export function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => register(email, password, displayName || undefined),
    onSuccess: (response) => {
      setSession(response.user, response.tokens);
      router.push("/dashboard");
    },
  });

  return (
    <AuthLayout
      title="Create account"
      subtitle="Set up a secure profile for virtual coin prediction rounds."
      footer={
        <>
          Already joined?{" "}
          <Link href="/login" className="font-black text-ink">
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
        <label className="grid gap-2 text-sm font-bold">
          Display name
          <input
            className="min-h-12 rounded-md border border-line bg-white px-3 outline-none focus:border-ink"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="nickname"
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Email
          <input
            className="min-h-12 rounded-md border border-line bg-white px-3 outline-none focus:border-ink"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Password
          <input
            className="min-h-12 rounded-md border border-line bg-white px-3 outline-none focus:border-ink"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="text-xs font-semibold leading-5 text-muted">
          Use 12+ characters with upper/lowercase letters, a number, and a symbol.
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
