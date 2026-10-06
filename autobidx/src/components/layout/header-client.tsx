"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, Search, Shield, X, Gavel, Car, Users, PlusCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useToast } from "../ui/toast";
import { Logo } from "./logo";

type HeaderUser = { name: string; dealerName: string | null; isAdmin: boolean; unread: number } | null;
type Note = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

const NAV = [
  { href: "/vehicles", label: "Browse Cars", icon: Car },
  { href: "/auctions", label: "Live Auctions", icon: Gavel },
  { href: "/dealers", label: "Dealers", icon: Users },
];

export function HeaderClient({ user, transparent = false }: { user: HeaderUser; transparent?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { push } = useToast();
  const [menu, setMenu] = useState(false);
  const [acct, setAcct] = useState(false);
  const [bell, setBell] = useState(false);
  const [unread, setUnread] = useState(user?.unread ?? 0);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false);
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcct(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Realtime notifications (outbid, won, offers…) via SSE
  useEffect(() => {
    if (!user) return;
    const es = new EventSource("/api/notifications/stream");
    es.addEventListener("notification", (e) => {
      const n = JSON.parse((e as MessageEvent).data) as { title: string; body: string; type: string };
      setUnread((u) => u + 1);
      setNotes(null);
      push({ tone: n.type === "OUTBID" || n.type === "PAYMENT_FAILED" ? "error" : "info", title: n.title, body: n.body });
    });
    return () => es.close();
  }, [user, push]);

  async function openBell() {
    setBell((b) => !b);
    if (!notes) {
      const { data } = await api<{ items: Note[]; unreadCount: number }>("/api/notifications");
      if (data) {
        setNotes(data.items);
        setUnread(data.unreadCount);
      }
    }
  }
  async function markAll() {
    await api("/api/notifications", { body: { all: true } });
    setUnread(0);
    setNotes((n) => n?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null);
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const solid = !transparent || scrolled || menu;
  const textCls = solid ? "text-ink-900" : "text-white";
  return (
    <header className={cn("sticky top-0 z-50 transition-colors", solid ? "border-b border-slate-200/80 bg-white/95 backdrop-blur" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo dark={!solid} />
        <nav className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cn("rounded-lg px-3 py-2 text-[14px] font-semibold transition", textCls, pathname.startsWith(n.href) ? (solid ? "bg-slate-100" : "bg-white/15") : solid ? "hover:bg-slate-50" : "hover:bg-white/10")}>
              {n.label}
            </Link>
          ))}
          <Link href={user ? "/dashboard/vehicles/new" : "/register"} className={cn("rounded-lg px-3 py-2 text-[14px] font-semibold", textCls, solid ? "hover:bg-slate-50" : "hover:bg-white/10")}>
            Sell Your Car
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/vehicles" aria-label="Search vehicles" className={cn("flex h-10 w-10 items-center justify-center rounded-lg lg:hidden", textCls)}>
            <Search className="h-5 w-5" />
          </Link>
          {user ? (
            <>
              <div className="relative" ref={bellRef}>
                <button onClick={openBell} className={cn("relative flex h-10 w-10 items-center justify-center rounded-lg", textCls, solid ? "hover:bg-slate-100" : "hover:bg-white/10")} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
                  <Bell className="h-5 w-5" />
                  {unread > 0 && <span className="num absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ignite-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
                </button>
                {bell && (
                  <div className="absolute right-0 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-lift)]">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <span className="text-sm font-bold text-ink-900">Notifications</span>
                      {unread > 0 && <button onClick={markAll} className="text-[12px] font-semibold text-ignite-600 hover:underline">Mark all read</button>}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {!notes ? (
                        <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
                      ) : notes.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">You&apos;re all caught up.</div>
                      ) : (
                        notes.map((n) => (
                          <Link key={n.id} href={n.link ?? "/dashboard"} onClick={() => setBell(false)} className={cn("block border-b border-slate-50 px-4 py-3 hover:bg-slate-50", !n.readAt && "bg-ignite-50/40")}>
                            <div className="flex items-start gap-2">
                              {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ignite-500" />}
                              <div className="min-w-0">
                                <div className="text-[13.5px] font-semibold text-ink-900">{n.title}</div>
                                <div className="line-clamp-2 text-[12.5px] text-slate-600">{n.body}</div>
                                <div className="mt-1 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</div>
                              </div>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative hidden sm:block" ref={acctRef}>
                <button onClick={() => setAcct((a) => !a)} className={cn("flex h-10 items-center gap-2 rounded-lg pl-1.5 pr-2", textCls, solid ? "hover:bg-slate-100" : "hover:bg-white/10")}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ignite-500 text-[12px] font-bold text-white">{user.name.charAt(0)}</span>
                  <span className="max-w-32 truncate text-[13.5px] font-semibold">{user.dealerName ?? user.name}</span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </button>
                {acct && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-lift)]">
                    <div className="border-b border-slate-100 px-4 py-2.5">
                      <div className="truncate text-sm font-semibold text-ink-900">{user.name}</div>
                      {user.dealerName && <div className="truncate text-[12px] text-slate-500">{user.dealerName}</div>}
                    </div>
                    <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"><LayoutDashboard className="h-4 w-4" />Dashboard</Link>
                    {user.isAdmin && <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"><Shield className="h-4 w-4" />Admin panel</Link>}
                    <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><LogOut className="h-4 w-4" />Sign out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className={cn("hidden h-10 items-center rounded-lg px-3 text-[14px] font-semibold sm:flex", textCls, solid ? "hover:bg-slate-100" : "hover:bg-white/10")}>Sign in</Link>
              <Link href="/register" className="hidden h-10 items-center rounded-lg bg-ignite-500 px-4 text-[14px] font-bold text-white hover:bg-ignite-600 sm:flex">Join as Dealer</Link>
            </>
          )}
          <button onClick={() => setMenu((m) => !m)} className={cn("flex h-10 w-10 items-center justify-center rounded-lg lg:hidden", textCls)} aria-label="Menu" aria-expanded={menu}>
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {menu && (
        <div className="border-t border-slate-200 bg-white px-4 pb-5 pt-2 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center gap-3 rounded-lg px-2 py-3 text-[15px] font-semibold text-ink-900 hover:bg-slate-50">
              <n.icon className="h-5 w-5 text-slate-400" />
              {n.label}
            </Link>
          ))}
          <Link href={user ? "/dashboard/vehicles/new" : "/register"} className="flex items-center gap-3 rounded-lg px-2 py-3 text-[15px] font-semibold text-ink-900 hover:bg-slate-50">
            <PlusCircle className="h-5 w-5 text-slate-400" /> Sell Your Car
          </Link>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
            {user ? (
              <>
                <Link href="/dashboard" className="flex h-11 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold text-white">Dashboard</Link>
                {user.isAdmin ? <Link href="/admin" className="flex h-11 items-center justify-center rounded-lg border border-slate-300 text-sm font-bold">Admin</Link> : <button onClick={logout} className="h-11 rounded-lg border border-slate-300 text-sm font-bold">Sign out</button>}
              </>
            ) : (
              <>
                <Link href="/login" className="flex h-11 items-center justify-center rounded-lg border border-slate-300 text-sm font-bold">Sign in</Link>
                <Link href="/register" className="flex h-11 items-center justify-center rounded-lg bg-ignite-500 text-sm font-bold text-white">Join as Dealer</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
