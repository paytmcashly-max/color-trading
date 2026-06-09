"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchWallet, fetchWalletTransactions } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useGameStore } from "@/store/game-store";

export function useWallet() {
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const wallet = useGameStore((state) => state.wallet);
  const setWallet = useGameStore((state) => state.setWallet);

  const walletQuery = useQuery({
    queryKey: ["wallet"],
    queryFn: () => fetchWallet(token!),
    enabled: Boolean(token),
    staleTime: 15_000,
  });

  const transactionsQuery = useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: () => fetchWalletTransactions(token!),
    enabled: Boolean(token),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (walletQuery.data?.wallet) {
      setWallet(walletQuery.data.wallet);
    }
  }, [setWallet, walletQuery.data]);

  return {
    wallet,
    transactions: transactionsQuery.data?.transactions ?? [],
    isLoading: walletQuery.isLoading,
    isTransactionsLoading: transactionsQuery.isLoading,
    error: walletQuery.error ?? transactionsQuery.error,
    refetch: async () => {
      await Promise.all([walletQuery.refetch(), transactionsQuery.refetch()]);
    },
  };
}
