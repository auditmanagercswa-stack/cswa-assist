"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { NAV, activeHref } from "./nav";
import { cn } from "@/lib/utils";

/** Bottom tab bar on phones; "More" opens a sheet with the remaining sections. */
export function MobileNav() {
  const active = activeHref(usePathname());
  const [open, setOpen] = useState(false);
  const tabs = NAV.filter((n) => n.mobile);
  const rest = NAV.filter((n) => !n.mobile);
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-forest pb-[env(safe-area-inset-bottom)] text-on-forest md:hidden" aria-label="Main">
        {tabs.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active === href ? "page" : undefined}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active === href ? "text-gold" : "text-on-forest/70")}>
            <Icon className="size-5" strokeWidth={1.7} />{label}
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-on-forest/70" aria-haspopup="dialog">
          <MoreHorizontal className="size-5" />More
        </button>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 bg-forest/50 md:hidden" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="More sections">
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-lg">All sections</span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1 hover:bg-sand"><X className="size-5" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {rest.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setOpen(false)}
                  className={cn("flex flex-col items-center gap-1 rounded-2xl p-3 text-xs", active === href ? "bg-gold text-white" : "bg-sand text-ink")}>
                  <Icon className="size-5" strokeWidth={1.7} />{label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
