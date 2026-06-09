"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { login } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (response) => {
      setSession(response.user, response.tokens);
      router.push("/dashboard");
    },
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your live prediction workspace."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-black text-ink">
            Create account
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
            autoComplete="current-password"
            required
          />
        </label>
        {mutation.error ? (
          <p className="rounded-md bg-[#fee2e2] px-3 py-2 text-sm font-semibold text-[#991b1b]">
            {mutation.error.message}
          </p>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Signing in" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
