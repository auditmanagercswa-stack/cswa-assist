"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Bell, Car, ChevronDown, CreditCard, FileText, Gavel, Hammer, Handshake, Heart, LayoutDashboard, PlusCircle, Receipt, Scale, Settings, ShieldAlert, ShieldCheck, ShoppingBag, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

// Icons are referenced by name: component functions can't be passed from Server to Client Components.
const ICONS = { BarChart3, Bell, Car, CreditCard, FileText, Gavel, Hammer, Handshake, Heart, LayoutDashboard, PlusCircle, Receipt, Scale, Settings, ShieldAlert, ShieldCheck, ShoppingBag, Users, Wallet };
export type IconName = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: IconName; badge?: number | null; exact?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

export function SideNav({ groups, title }: { groups: NavGroup[]; title: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const all = groups.flatMap((g) => g.items);
  const isActive = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));
  const current = [...all].sort((a, b) => b.href.length - a.href.length).find(isActive) ?? all[0];
  const CurrentIcon = current ? ICONS[current.icon] : null;
  const list = (
    <nav className="space-y-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <div className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.title}</div>}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = current?.href === i.href;
              const Icon = ICONS[i.icon];
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition", active ? "bg-ink-900 text-white" : "text-slate-600 hover:bg-white hover:text-ink-900")}>
                    <Icon className={cn("h-[18px] w-[18px]", active ? "text-ignite-400" : "text-slate-400")} />
                    <span className="flex-1">{i.label}</span>
                    {!!i.badge && <span className={cn("num rounded-full px-1.5 text-[11px] font-bold", active ? "bg-white/20" : "bg-ignite-500 text-white")}>{i.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <div className="lg:hidden">
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left" aria-expanded={open}>
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">{CurrentIcon && <CurrentIcon className="h-4 w-4 text-ignite-600" />}{title}: {current?.label}</span>
          <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
        </button>
        {open && <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">{list}</div>}
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-20">{list}</div>
      </aside>
    </>
  );
}
