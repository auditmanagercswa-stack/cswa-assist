"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, activeHref } from "./nav";
import { cn } from "@/lib/utils";

/** Narrow dark-green rail: logo badge, Tally sync dot, stacked icon + label nav. */
export function Sidebar({ initials, syncLabel, syncOk }: { initials: string; syncLabel: string; syncOk: boolean }) {
  const active = activeHref(usePathname());
  return (
    <aside className="sticky top-0 hidden h-dvh w-24 shrink-0 flex-col items-center gap-3 overflow-y-auto bg-forest py-4 text-on-forest md:flex" aria-label="Main">
      <Link href="/" className="grid size-12 place-items-center rounded-2xl bg-white font-display text-lg font-bold text-forest shadow-md" aria-label="Home">
        {initials}
      </Link>
      <div className="flex items-center gap-1.5 text-[11px] text-on-forest/70" title={syncLabel}>
        <span className={cn("size-2 rounded-full", syncOk ? "bg-mint" : "bg-gold-light")} />
        Tally
      </div>
      <nav className="mt-1 flex w-full flex-col items-center gap-1 px-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = active === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] leading-tight transition-colors duration-200",
                on ? "bg-white text-forest shadow" : "text-on-forest/75 hover:bg-white/10 hover:text-on-forest"
              )}
            >
              <Icon className="size-5" strokeWidth={1.7} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
