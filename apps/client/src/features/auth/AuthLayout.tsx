import Link from "next/link";
import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-canvas px-4 py-6 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-between">
        <div className="pt-8">
          <Link href="/" className="text-sm font-black text-[#16874f]">
            Color Trading
          </Link>
          <div className="mt-10">
            <p className="text-xs font-extrabold uppercase text-muted">Virtual gaming lobby</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
          </div>
          <div className="mt-8 rounded-3xl border border-line bg-white p-4 shadow-[0_18px_48px_rgba(23,32,26,0.10)]">
            {children}
          </div>
        </div>
        <div className="py-5 text-center text-sm font-semibold text-muted">{footer}</div>
      </div>
    </main>
  );
}
