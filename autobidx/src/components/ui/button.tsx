import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

const variants = {
  primary: "bg-ignite-500 text-white hover:bg-ignite-600 shadow-sm shadow-ignite-500/20",
  dark: "bg-ink-900 text-white hover:bg-ink-700",
  outline: "border border-slate-300 bg-white text-ink-900 hover:border-ink-900",
  ghost: "text-ink-900 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-verified-500 text-white hover:bg-verified-600",
  light: "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20 backdrop-blur",
} as const;
const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]", xl: "h-14 px-7 text-base" } as const;

type Common = { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string; children: ReactNode; block?: boolean };

const base = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap";

export function Button({ variant = "primary", size = "md", className, loading, block, children, ...rest }: Common & ComponentProps<"button"> & { loading?: boolean }) {
  return (
    <button className={cn(base, variants[variant], sizes[size], block && "w-full", className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", className, block, children, ...rest }: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], block && "w-full", className)} {...rest}>
      {children}
    </Link>
  );
}
