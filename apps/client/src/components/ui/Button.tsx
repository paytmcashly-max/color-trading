import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "violet";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-[#26332a]",
  secondary: "border border-line bg-white text-ink hover:bg-[#eef3ee]",
  danger: "bg-[#c92a2a] text-white hover:bg-[#ac2020]",
  success: "bg-[#16874f] text-white hover:bg-[#106b3d]",
  violet: "bg-[#6e46b9] text-white hover:bg-[#58369a]",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-4 text-sm font-extrabold transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
