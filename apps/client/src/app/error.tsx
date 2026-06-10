"use client";

import { RefreshCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 text-ink">
      <section className="w-full max-w-sm rounded-md border border-line bg-white p-4 text-center shadow-sm">
        <p className="text-xs font-extrabold uppercase text-muted">Something went wrong</p>
        <h1 className="mt-2 text-xl font-black">Please try again</h1>
        <p className="mt-2 text-sm font-semibold text-muted">
          {error.digest ? `Error ${error.digest}` : "The page could not finish loading."}
        </p>
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-extrabold text-white"
          onClick={reset}
        >
          <RefreshCcw size={16} aria-hidden="true" />
          Retry
        </button>
      </section>
    </main>
  );
}
