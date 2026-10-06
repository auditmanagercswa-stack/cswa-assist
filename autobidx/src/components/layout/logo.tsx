import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#0b1220" />
      <path d="M11 28 L18.5 12 L22 12 L29.5 28 L25.6 28 L20.2 15.6 L14.9 28 Z" fill="#ffffff" />
      <path d="M15.5 23 L25 23" stroke="#f2551d" strokeWidth="3" strokeLinecap="round" />
      <circle cx="30.5" cy="11" r="3" fill="#f2551d" />
    </svg>
  );
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)} aria-label="AutoBidX home">
      <LogoMark />
      <span className={cn("font-display text-[21px] font-bold tracking-tight", dark ? "text-white" : "text-ink-900")}>
        Auto<span className="text-ignite-500">BidX</span>
      </span>
    </Link>
  );
}
