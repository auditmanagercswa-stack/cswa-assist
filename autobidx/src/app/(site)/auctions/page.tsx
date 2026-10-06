import type { Metadata } from "next";
import Link from "next/link";
import { Gavel } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime, formatINR } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { cardSelect } from "@/server/services/vehicles";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Live used-car auctions", description: "Bid on verified used cars in live, time-bound dealer auctions. Real-time bidding with anti-sniping protection.", alternates: { canonical: "/auctions" } };

const PER = 24;

export default async function AuctionsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "upcoming" || sp.tab === "ended" ? sp.tab : "live";
  const page = Math.max(1, Math.min(200, Number(sp.page) || 1));
  const actor = await getCurrentActor();
  const now = new Date();
  const where = tab === "live" ? { status: "LIVE" as const, endAt: { gt: now } } : tab === "upcoming" ? { status: "SCHEDULED" as const } : { status: "ENDED" as const };
  const [items, total, counts, watch] = await Promise.all([
    prisma.auction.findMany({
      where,
      orderBy: tab === "ended" ? { closedAt: "desc" } : tab === "upcoming" ? { startAt: "asc" } : { endAt: "asc" },
      skip: (page - 1) * PER,
      take: PER,
      select: { id: true, status: true, result: true, startAt: true, endAt: true, currentBid: true, bidCount: true, startingBid: true, vehicle: { select: cardSelect } },
    }),
    prisma.auction.count({ where }),
    Promise.all([prisma.auction.count({ where: { status: "LIVE", endAt: { gt: now } } }), prisma.auction.count({ where: { status: "SCHEDULED" } })]),
    actor ? prisma.watchlist.findMany({ where: { userId: actor.userId }, select: { vehicleId: true } }) : [],
  ]);
  const watching = new Set(watch.map((w) => w.vehicleId));
  const tabs: [string, string, number | null][] = [["live", "Live now", counts[0]], ["upcoming", "Upcoming", counts[1]], ["ended", "Recently ended", null]];
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-ignite-600"><span className="h-2 w-2 animate-pulse-soft rounded-full bg-ignite-500" />Auctions</div>
          <h1 className="mt-1 text-[28px] font-bold text-ink-900 sm:text-[34px]">Live dealer auctions</h1>
          <p className="mt-1 text-sm text-slate-500">Server-timed countdowns · bids in the last 2 minutes extend the auction · proxy bidding available</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map(([k, l, c]) => (
            <Link key={k} href={k === "live" ? "/auctions" : `/auctions?tab=${k}`} className={cn("rounded-lg px-4 py-2 text-[13.5px] font-semibold", tab === k ? "bg-ink-900 text-white" : "text-slate-600 hover:text-ink-900")}>
              {l}{c != null && <span className={cn("num ml-1.5 rounded-full px-1.5 text-[11px]", tab === k ? "bg-white/20" : "bg-slate-100")}>{c}</span>}
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState icon={<Gavel className="h-7 w-7" />} title={tab === "live" ? "No active auctions" : tab === "upcoming" ? "No upcoming auctions" : "No ended auctions yet"} description="New auctions start every day. Add vehicles to your watchlist to get alerts." />
        ) : tab === "ended" ? (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-white">
            {items.map((a) => (
              <Link key={a.id} href={`/auctions/${a.id}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink-900">{a.vehicle.title}</div>
                  <div className="text-[12.5px] text-slate-500">Ended {formatDateTime(a.endAt)} · {a.bidCount} bids</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="num font-bold text-ink-900">{a.currentBid ? formatINR(a.currentBid) : "—"}</span>
                  <StatusBadge status={a.result} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((a, i) => <VehicleCard key={a.id} v={a.vehicle} watching={watching.has(a.vehicle.id)} signedIn={!!actor} serverTime={now.toISOString()} priority={i < 4} />)}
          </div>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER)} basePath="/auctions" params={sp} />
      </div>
    </div>
  );
}
