import Link from "next/link";
import { ArrowRight, Car, Clock, Gavel, IndianRupee, PackageCheck, Receipt, ShoppingBag, Trophy, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatINR, formatINRCompact, formatNumber } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { dealerCharts, dealerDashboard } from "@/server/services/analytics";
import { listBanners } from "@/server/services/cms";
import { DashboardCard } from "@/components/ui/stat";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { BarChart, HBarList, LineChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/ui/empty";
import { AuctionTimer } from "@/components/auction/auction-timer";

export const metadata = { title: "Overview" };

export default async function DashboardHome() {
  const actor = (await getCurrentActor())!;
  const dealerId = actor.dealer?.id ?? "none";
  const [s, charts, todo, myLive, banners] = await Promise.all([
    dealerDashboard(dealerId, actor.userId),
    dealerCharts(dealerId),
    prisma.order.findMany({
      where: { OR: [{ buyerId: actor.userId, status: { in: ["PAYMENT_PENDING", "IN_DELIVERY"] } }, { sellerDealerId: dealerId, status: { in: ["PAYMENT_RECEIVED", "SELLER_CONFIRMED", "DOCUMENTS_PENDING", "VEHICLE_READY"] } }] },
      include: { vehicle: { select: { title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.auction.findMany({ where: { status: "LIVE", vehicle: { dealerId } }, include: { vehicle: { select: { title: true } } }, orderBy: { endAt: "asc" }, take: 5 }),
    listBanners("DASHBOARD"),
  ]);
  const serverTime = new Date().toISOString();
  const nextStep = (o: (typeof todo)[number]) =>
    o.buyerId === actor.userId
      ? o.status === "PAYMENT_PENDING" ? "Complete payment" : "Confirm receipt"
      : o.status === "PAYMENT_RECEIVED" ? "Confirm sale" : o.status === "SELLER_CONFIRMED" ? "Start documentation" : o.status === "DOCUMENTS_PENDING" ? "Upload RC & mark ready" : "Schedule pickup / delivery";
  return (
    <div>
      <PageHeader eyebrow={actor.dealer?.name} title={`Good to see you, ${actor.name.split(" ")[0]}`} subtitle="Here's how your dealership is doing." actions={<><ButtonLink href="/dashboard/vehicles/new"><Car className="h-4 w-4" />List a vehicle</ButtonLink><ButtonLink href="/auctions" variant="outline"><Gavel className="h-4 w-4" />Live auctions</ButtonLink></>} />
      {banners[0] && (
        <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl bg-ink-900 p-4 text-white sm:flex-row sm:items-center">
          <div><div className="font-bold">{banners[0].title}</div>{banners[0].subtitle && <div className="text-[13px] text-white/70">{banners[0].subtitle}</div>}</div>
          {banners[0].ctaHref && <ButtonLink href={banners[0].ctaHref} size="sm">{banners[0].ctaLabel ?? "Learn more"}</ButtonLink>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <DashboardCard label="Total listings" value={formatNumber(s.totalListings)} icon={<Car className="h-4 w-4" />} href="/dashboard/vehicles" />
        <DashboardCard label="Active auctions" value={formatNumber(s.activeAuctions)} icon={<Gavel className="h-4 w-4" />} tone="orange" href="/dashboard/auctions" />
        <DashboardCard label="Sold vehicles" value={formatNumber(s.sold)} icon={<PackageCheck className="h-4 w-4" />} tone="green" />
        <DashboardCard label="Pending sales" value={formatNumber(s.pendingSales)} icon={<Clock className="h-4 w-4" />} tone="amber" href="/dashboard/orders?side=selling" />
        <DashboardCard label="Total sales value" value={formatINRCompact(s.totalSalesValue)} sub={`Net receivable ${formatINRCompact(s.netReceivable)}`} icon={<IndianRupee className="h-4 w-4" />} tone="dark" />
        <DashboardCard label="Platform fees paid" value={formatINR(s.platformFees)} icon={<Receipt className="h-4 w-4" />} href="/dashboard/payments" />
        <DashboardCard label="Outstanding payments" value={formatINR(s.outstandingPayments)} sub={s.outstandingOrders ? `${s.outstandingOrders} order(s) awaiting your payment` : undefined} icon={<Wallet className="h-4 w-4" />} tone="amber" href="/dashboard/payments" />
        <DashboardCard label="Active bids" value={formatNumber(s.activeBids)} sub="auctions you're bidding in" icon={<ShoppingBag className="h-4 w-4" />} href="/dashboard/bids" />
        <DashboardCard label="Won auctions" value={formatNumber(s.wonAuctions)} icon={<Trophy className="h-4 w-4" />} tone="green" href="/dashboard/bids?tab=won" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Needs your attention" subtitle="Orders waiting on you" action={<Link href="/dashboard/orders" className="text-[13px] font-semibold text-ignite-600">All orders</Link>} />
          {todo.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-5 text-center text-[13.5px] text-slate-500">Nothing pending — you&apos;re all caught up.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todo.map((o) => (
                <li key={o.id}>
                  <Link href={o.status === "PAYMENT_PENDING" && o.buyerId === actor.userId ? `/checkout/${o.id}` : `/dashboard/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink-900">{o.vehicle.title}</div>
                      <div className="flex items-center gap-2 text-[12.5px] text-slate-500"><span className="font-mono">{o.orderNumber}</span><StatusBadge status={o.status} /></div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ignite-600">{nextStep(o)}<ArrowRight className="h-4 w-4" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Your live auctions" action={<Link href="/dashboard/auctions" className="text-[13px] font-semibold text-ignite-600">Manage</Link>} />
          {myLive.length === 0 ? (
            <EmptyState className="border-0 py-6" title="No active auctions" description="Start by listing your first vehicle with auction enabled." action={<ButtonLink href="/dashboard/vehicles/new" size="sm">List Vehicle</ButtonLink>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {myLive.map((a) => (
                <li key={a.id}>
                  <Link href={`/auctions/${a.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-ink-900">{a.vehicle.title}</div>
                      <div className="text-[12.5px] text-slate-500">{a.bidCount} bids · reserve {a.reservePrice ? ((a.currentBid ?? 0) >= a.reservePrice ? "met" : "not met") : "none"}</div>
                    </div>
                    <div className="text-right">
                      <div className="num font-bold text-ink-900">{a.currentBid ? formatINR(a.currentBid) : "No bids"}</div>
                      <AuctionTimer endAt={a.endAt.toISOString()} serverTime={serverTime} compact className="text-[12px]" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card><CardHeader title="Sales by month" subtitle="Vehicles sold (paid orders), last 12 months" /><BarChart data={charts.salesByMonth} label="Vehicles sold per month" /></Card>
        <Card><CardHeader title="Revenue" subtitle="Net receivable after platform fees" /><LineChart data={charts.revenueByMonth} format="inr" label="Net revenue per month" /></Card>
        <Card><CardHeader title="Listing activity" subtitle="New listings created per month" /><BarChart data={charts.listingsByMonth} label="Listings per month" /></Card>
        <Card><CardHeader title="Average selling price" subtitle="Per month, paid orders" /><LineChart data={charts.avgPriceByMonth} format="inr" label="Average selling price" /></Card>
        <Card className="xl:col-span-2"><CardHeader title="Auction performance" subtitle="Outcomes of your ended auctions" /><HBarList data={charts.auctionPerformance} label="Auction outcomes" /></Card>
      </div>
    </div>
  );
}
