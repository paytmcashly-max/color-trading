"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TokenPair, UserDto } from "@/types/api";

interface AuthState {
  user: UserDto | null;
  tokens: TokenPair | null;
  setSession: (user: UserDto, tokens: TokenPair) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      setSession: (user, tokens) => set({ user, tokens }),
      clearSession: () => set({ user: null, tokens: null }),
    }),
    {
      name: "color-trading-session",
    },
  ),
);
