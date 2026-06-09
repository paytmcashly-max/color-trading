"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";

import { fetchMe, refreshSession } from "@/services/api-client";
import { useAuthStore } from "@/store/auth-store";

const publicPaths = new Set(["/login", "/register"]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const tokens = useAuthStore((state) => state.tokens);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const setSession = useAuthStore((state) => state.setSession);
  const setRestoring = useAuthStore((state) => state.setRestoring);
  const clearSession = useAuthStore((state) => state.clearSession);
  const isPublicRoute = publicPaths.has(pathname);

  const loginHref = useMemo(() => {
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return `/login${next}`;
  }, [pathname]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!tokens) {
      setRestoring(false);
      if (!isPublicRoute) {
        router.replace(loginHref);
      }
      return;
    }

    const sessionTokens = tokens;
    let cancelled = false;

    async function restoreSession() {
      setRestoring(true);

      try {
        const current = await fetchMe(sessionTokens.accessToken);
        if (!cancelled) {
          setSession(current.user, sessionTokens);
        }
      } catch {
        try {
          const refreshed = await refreshSession(sessionTokens.refreshToken);
          if (!cancelled) {
            setSession(refreshed.user, refreshed.tokens);
          }
        } catch {
          if (!cancelled) {
            clearSession();
            if (!isPublicRoute) {
              router.replace(loginHref);
            }
          }
        }
      } finally {
        if (!cancelled) {
          setRestoring(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [clearSession, hasHydrated, isPublicRoute, loginHref, router, setRestoring, setSession, tokens]);

  useEffect(() => {
    if (!hasHydrated || isRestoring || !tokens || !user || !isPublicRoute) {
      return;
    }

    router.replace("/");
  }, [hasHydrated, isPublicRoute, isRestoring, router, tokens, user]);

  if (!hasHydrated || (isRestoring && !isPublicRoute)) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4 text-ink">
        <div className="w-full max-w-sm rounded-md border border-line bg-white p-4 text-center shadow-sm">
          <p className="text-xs font-extrabold uppercase text-muted">Session</p>
          <p className="mt-2 text-lg font-black">Checking secure access</p>
        </div>
      </main>
    );
  }

  return children;
}
