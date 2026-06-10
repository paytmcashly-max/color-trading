"use client";

import { create } from "zustand";

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

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  tokens: null,
  hasHydrated: true,
  isRestoring: true,
  setSession: (user, tokens) => set({ user, tokens }),
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
  setRestoring: (isRestoring) => set({ isRestoring }),
  clearSession: () => set({ user: null, tokens: null }),
}));
