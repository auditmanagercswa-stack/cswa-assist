import Link from "next/link";
import { BarChart3, Eye, Gavel, Handshake, Heart, IndianRupee, Percent, Receipt, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatINR, formatINRCompact, formatNumber } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { activePlanId } from "@/server/services/fees";
import { dealerAnalytics, dealerCharts } from "@/server/services/analytics";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { DashboardCard } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { BarChart, HBarList, LineChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const actor = (await getCurrentActor())!;
  const dealerId = actor.dealer?.id ?? "none";
  const planId = await activePlanId(dealerId);
  const plan = planId ? await prisma.subscriptionPlan.findUnique({ where: { id: planId } }) : null;
  if (plan && !plan.analytics) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <EmptyState icon={<BarChart3 className="h-7 w-7" />} title="Analytics is part of Pro & Premium" description="See views, watchlists, bids, conversion and revenue for every listing." action={<ButtonLink href="/dashboard/settings?tab=plan">Compare plans</ButtonLink>} />
      </div>
    );
  }
  const [a, c] = await Promise.all([dealerAnalytics(dealerId), dealerCharts(dealerId)]);
  return (
    <div>
      <PageHeader title="Analytics" subtitle={`Performance of ${actor.dealer?.name ?? "your dealership"}${plan ? ` · ${plan.name} plan` : ""}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <DashboardCard label="Listing views" value={formatNumber(a.views)} icon={<Eye className="h-4 w-4" />} />
        <DashboardCard label="Enquiries (offers)" value={formatNumber(a.enquiries)} icon={<Handshake className="h-4 w-4" />} />
        <DashboardCard label="Watchlists" value={formatNumber(a.watchlists)} icon={<Heart className="h-4 w-4" />} />
        <DashboardCard label="Bids received" value={formatNumber(a.bids)} icon={<Gavel className="h-4 w-4" />} tone="orange" />
        <DashboardCard label="Average bid" value={formatINRCompact(a.avgBid)} icon={<TrendingUp className="h-4 w-4" />} />
        <DashboardCard label="Conversion" value={`${a.conversion}%`} sub="sold ÷ published listings" icon={<Percent className="h-4 w-4" />} tone="green" />
        <DashboardCard label="Sales" value={formatNumber(a.sales)} icon={<Receipt className="h-4 w-4" />} />
        <DashboardCard label="Revenue (GMV)" value={formatINRCompact(a.revenue)} icon={<IndianRupee className="h-4 w-4" />} tone="dark" />
        <DashboardCard label="Net revenue" value={formatINRCompact(a.netRevenue)} tone="green" />
        <DashboardCard label="Platform fees" value={formatINR(a.fees)} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card><CardHeader title="Listing views" subtitle="Last 6 months" /><LineChart data={a.viewsByMonth} label="Listing views per month" /></Card>
        <Card><CardHeader title="Sales by month" /><BarChart data={c.salesByMonth} label="Sales per month" /></Card>
        <Card><CardHeader title="Revenue by month" subtitle="Net receivable" /><LineChart data={c.revenueByMonth} format="inr" label="Revenue per month" /></Card>
        <Card><CardHeader title="Auction outcomes" /><HBarList data={c.auctionPerformance} label="Auction outcomes" /></Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Top listings" subtitle="By views" />
        {a.topVehicles.length === 0 ? <p className="text-sm text-slate-500">No published listings yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead><tr className="text-[11.5px] uppercase tracking-wide text-slate-400"><th className="py-2">Vehicle</th><th>Status</th><th className="text-right">Views</th><th className="text-right">Watch</th><th className="text-right">Offers</th><th className="text-right">Bids</th><th className="text-right">Price / bid</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {a.topVehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="max-w-[240px] truncate py-2.5 font-semibold"><Link href={`/dashboard/vehicles/${v.id}`} className="hover:text-ignite-600">{v.title}</Link></td>
                    <td><StatusBadge status={v.status} /></td>
                    <td className="num text-right">{formatNumber(v.viewCount)}</td>
                    <td className="num text-right">{formatNumber(v.watchCount)}</td>
                    <td className="num text-right">{v.enquiryCount}</td>
                    <td className="num text-right">{v.bidCount}</td>
                    <td className="num text-right font-semibold">{formatINR(v.currentBid ?? v.expectedPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
