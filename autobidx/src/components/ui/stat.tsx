import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function DashboardCard({ label, value, sub, icon, tone = "default", href }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "default" | "orange" | "green" | "amber" | "dark"; href?: string }) {
  const toneCls = {
    default: "bg-white",
    orange: "bg-white",
    green: "bg-white",
    amber: "bg-white",
    dark: "bg-ink-900 text-white border-ink-900",
  }[tone];
  const iconCls = { default: "bg-slate-100 text-slate-600", orange: "bg-ignite-50 text-ignite-600", green: "bg-verified-50 text-verified-600", amber: "bg-amber-50 text-amber-600", dark: "bg-white/10 text-white" }[tone];
  const body = (
    <div className={cn("h-full rounded-[var(--radius-card)] border border-[var(--border)] p-4 shadow-[var(--shadow-card)] transition sm:p-5", toneCls, href && "hover:shadow-[var(--shadow-lift)]")}>
      <div className="flex items-start justify-between gap-2">
        <div className={cn("text-[12.5px] font-semibold", tone === "dark" ? "text-white/70" : "text-slate-500")}>{label}</div>
        {icon && <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconCls)}>{icon}</div>}
      </div>
      <div className="num mt-2 text-[22px] font-bold leading-tight sm:text-[26px]">{value}</div>
      {sub && <div className={cn("mt-1 text-[12px]", tone === "dark" ? "text-white/60" : "text-slate-500")}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
