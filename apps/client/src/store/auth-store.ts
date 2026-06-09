"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TokenPair, UserDto } from "@/types/api";

interface AuthState {
  user: UserDto | null;
  tokens: TokenPair | null;
  hasHydrated: boolean;
  isRestoring: boolean;
  setSession: (user: UserDto, tokens: TokenPair) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setRestoring: (isRestoring: boolean) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      hasHydrated: false,
      isRestoring: true,
      setSession: (user, tokens) => set({ user, tokens }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setRestoring: (isRestoring) => set({ isRestoring }),
      clearSession: () => set({ user: null, tokens: null }),
    }),
    {
      name: "color-trading-session",
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        state?.setRestoring(false);
      },
    },
  ),
);
