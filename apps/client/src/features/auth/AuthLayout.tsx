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
    <main className="min-h-screen overflow-hidden bg-[#070812] px-4 py-6 text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-80px] top-[-80px] size-72 rounded-full bg-[#1fd87a]/18 blur-3xl" />
        <div className="absolute bottom-0 right-[-100px] size-80 rounded-full bg-[#8b5cf6]/18 blur-3xl" />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-between">
        <div className="relative pt-8">
          <Link href="/" className="text-sm font-black text-[#83ffc3]">
            Color Trading
          </Link>
          <div className="mt-10">
            <p className="text-xs font-extrabold uppercase text-white/45">Virtual gaming lobby</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-white/58">{subtitle}</p>
          </div>
          <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.07] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {children}
          </div>
        </div>
        <div className="relative py-5 text-center text-sm font-semibold text-white/55">{footer}</div>
      </div>
    </main>
  );
}
