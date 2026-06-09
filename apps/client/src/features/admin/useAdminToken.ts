"use client";

import { useAuthStore } from "@/store/auth-store";

export function useAdminToken() {
  return useAuthStore((state) => state.tokens?.accessToken ?? "");
}
