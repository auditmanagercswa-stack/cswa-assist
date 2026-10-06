import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, Car, Gavel, IndianRupee, Receipt, Scale, ShieldAlert, TrendingUp, Users, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatINRCompact, formatNumber, timeAgo } from "@/lib/format";
import { adminCharts, adminDashboard } from "@/server/services/analytics";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { DashboardCard } from "@/components/ui/stat";
import { BarChart, HBarList, LineChart } from "@/components/charts/charts";

export const metadata = { title: "Admin dashboard" };

export default async function AdminHome() {
  const [s, c, queue, recentAudit] = await Promise.all([
    adminDashboard(),
    adminCharts(),
    prisma.vehicle.findMany({ where: { status: "PENDING_APPROVAL" }, orderBy: { updatedAt: "asc" }, take: 5, select: { id: true, title: true, updatedAt: true, dealer: { select: { name: true } } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Operations" title="Marketplace overview" subtitle="Live state of AutoBidX" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <DashboardCard label="Total dealers" value={formatNumber(s.dealers)} icon={<Users className="h-4 w-4" />} href="/admin/dealers" />
        <DashboardCard label="Verified dealers" value={formatNumber(s.verified)} icon={<BadgeCheck className="h-4 w-4" />} tone="green" href="/admin/dealers?status=VERIFIED" />
        <DashboardCard label="Total vehicles" value={formatNumber(s.vehicles)} icon={<Car className="h-4 w-4" />} href="/admin/vehicles" />
        <DashboardCard label="Active auctions" value={formatNumber(s.activeAuctions)} icon={<Gavel className="h-4 w-4" />} tone="orange" href="/admin/auctions" />
        <DashboardCard label="Today's bids" value={formatNumber(s.todaysBids)} icon={<TrendingUp className="h-4 w-4" />} href="/admin/bids" />
        <DashboardCard label="Today's transactions" value={formatNumber(s.todaysTx)} icon={<Receipt className="h-4 w-4" />} href="/admin/orders" />
        <DashboardCard label="GMV (paid orders)" value={formatINRCompact(s.gmv)} icon={<IndianRupee className="h-4 w-4" />} tone="dark" />
        <DashboardCard label="Platform revenue" value={formatINRCompact(s.revenue)} sub="fees excl. GST" icon={<Wallet className="h-4 w-4" />} tone="green" />
        <DashboardCard label="Pending payments" value={formatNumber(s.pendingPayments)} sub={formatINRCompact(s.pendingPaymentsValue)} icon={<Wallet className="h-4 w-4" />} tone="amber" href="/admin/orders?status=PAYMENT_PENDING" />
        <DashboardCard label="Pending KYC" value={formatNumber(s.pendingKyc)} icon={<BadgeCheck className="h-4 w-4" />} tone="amber" href="/admin/dealers?status=UNDER_REVIEW" />
        <DashboardCard label="Open disputes" value={formatNumber(s.disputes)} icon={<Scale className="h-4 w-4" />} tone="amber" href="/admin/disputes" />
        <DashboardCard label="Fraud flags" value={formatNumber(s.openFlags)} icon={<ShieldAlert className="h-4 w-4" />} href="/admin/reports?tab=fraud" />
      </div>

      {(s.pendingVehicles > 0 || s.pendingKyc > 0) && (
        <Card className="mt-5">
          <CardHeader title="Approval queue" subtitle={`${s.pendingVehicles} listings · ${s.pendingKyc} KYC submissions waiting`} action={<Link href="/admin/vehicles?status=PENDING_APPROVAL" className="text-[13px] font-semibold text-ignite-600">Review all</Link>} />
          <ul className="divide-y divide-slate-100">
            {queue.map((v) => (
              <li key={v.id}><Link href={`/admin/vehicles/${v.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50"><span className="min-w-0"><span className="block truncate font-semibold text-ink-900">{v.title}</span><span className="text-[12px] text-slate-500">{v.dealer.name} · waiting {timeAgo(v.updatedAt)}</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></Link></li>
            ))}
            {s.pendingKyc > 0 && <li><Link href="/admin/dealers?status=UNDER_REVIEW" className="flex items-center justify-between py-2.5 text-[14px] font-semibold text-amber-700"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{s.pendingKyc} dealer KYC submission(s) to review</span><ArrowRight className="h-4 w-4" /></Link></li>}
          </ul>
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card><CardHeader title="GMV" subtitle="Value of paid orders per month" /><LineChart data={c.gmvByMonth} format="inr" label="GMV per month" /></Card>
        <Card><CardHeader title="Platform revenue" subtitle="Buyer + seller fees per month (excl. GST)" /><BarChart data={c.revenueByMonth} format="inr" label="Revenue per month" /></Card>
        <Card><CardHeader title="Vehicle listings" subtitle="New listings per month" /><BarChart data={c.listingsByMonth} label="Listings per month" /></Card>
        <Card><CardHeader title="Successful auctions" subtitle="Auctions closed as won per month" /><BarChart data={c.successfulAuctionsByMonth} label="Successful auctions per month" /></Card>
        <Card><CardHeader title="Active dealers" subtitle="Dealers who listed or bid in the month" /><LineChart data={c.activeDealersByMonth} label="Active dealers per month" /></Card>
        <Card><CardHeader title="Geographic distribution" subtitle="Listings by district" /><HBarList data={c.geo.map((g) => ({ label: `${g.district}, ${g.state}`, value: g.vehicles }))} label="Listings by district" /></Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent activity" subtitle="From the audit log" action={<Link href="/admin/reports?tab=audit" className="text-[13px] font-semibold text-ignite-600">Full audit log</Link>} />
        <ul className="divide-y divide-slate-100 text-[13.5px]">
          {recentAudit.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2"><span><span className="font-mono text-[12.5px] text-ink-900">{a.action}</span> <span className="text-slate-500">by {a.user?.name ?? "system"}{a.entityType ? ` · ${a.entityType}` : ""}</span></span><span className="shrink-0 text-[12px] text-slate-400">{timeAgo(a.createdAt)}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
