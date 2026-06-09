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
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-80px] top-[-80px] size-72 rounded-full bg-[#dff8ea] blur-3xl" />
        <div className="absolute bottom-0 right-[-100px] size-80 rounded-full bg-[#e9e3ff] blur-3xl" />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-between">
        <div className="relative pt-8">
          <Link href="/" className="text-sm font-black text-[#16874f]">
            Color Trading
          </Link>
          <div className="mt-10">
            <p className="text-xs font-extrabold uppercase text-muted">Virtual prediction arena</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
          </div>
          <div className="mt-8 rounded-[28px] border border-line bg-white p-4 shadow-[0_20px_60px_rgba(23,32,26,0.12)] backdrop-blur-xl">
            {children}
          </div>
        </div>
        <div className="relative py-5 text-center text-sm font-semibold text-muted">{footer}</div>
      </div>
    </main>
  );
}
